// Сверка DBML с живой схемой PostgreSQL по выгрузке information_schema.
// Модуль без DOM: им пользуется CLI.

import { cloneState } from "./history.js";
import { nextZoneColor } from "./colors.js";
import { fitZone } from "./layout.js";

/**
 * INTROSPECTION_SQL — запросы выгрузки для psql -At -F '|'. Столбцы:
 * columns — таблица, столбец, тип, порядок, первичный ключ, одиночный
 * уникальный индекс (ограничение UNIQUE или индекс, в том числе частичный);
 * fks — таблица, столбец, таблица-цель, столбец-цель, правило удаления,
 * имя ограничения, число столбцов в ограничении.
 */
export const INTROSPECTION_SQL = {
  columns: `SELECT c.table_name, c.column_name,
  CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
       WHEN c.data_type = 'character varying' THEN 'varchar'
       WHEN c.data_type = 'timestamp with time zone' THEN 'timestamptz'
       WHEN c.data_type = 'timestamp without time zone' THEN 'timestamp'
       WHEN c.data_type = 'ARRAY' THEN substr(c.udt_name, 2) || '[]'
       ELSE c.data_type END,
  c.ordinal_position,
  EXISTS (SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND k.column_name = c.column_name),
  EXISTS (SELECT 1 FROM pg_catalog.pg_index i
          JOIN pg_catalog.pg_class r ON r.oid = i.indrelid
          JOIN pg_catalog.pg_namespace n ON n.oid = r.relnamespace
          JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid AND a.attnum = i.indkey[0]
          WHERE i.indisunique AND NOT i.indisprimary AND i.indnatts = 1
            AND n.nspname = c.table_schema AND r.relname = c.table_name AND a.attname = c.column_name)
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.table_name NOT LIKE 'goose%'
ORDER BY 1, 4`,
  fks: `SELECT tc.table_name, k.column_name, u.table_name, u.column_name, rc.delete_rule, tc.constraint_name,
  (SELECT count(*) FROM information_schema.key_column_usage k2 WHERE k2.constraint_name = tc.constraint_name AND k2.table_schema = tc.table_schema)
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
JOIN information_schema.key_column_usage u ON u.constraint_name = rc.unique_constraint_name AND u.constraint_schema = rc.unique_constraint_schema
     AND u.ordinal_position = k.position_in_unique_constraint
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY 1, 6, k.ordinal_position`,
};

/** parseRows — строки выгрузки psql -At -F '|' в массивы полей; пустые строки пропускаются. */
export function parseRows(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|"));
}

const truthy = (value) => value === "t" || value === "true" || value === "1";

/**
 * syncSchema — DBML по живой схеме. Таблицы, столбцы, типы, ключи и связи
 * берутся из базы; заметки, скрытие, зоны, цвета и раскладка — из файла.
 * Новые таблицы попадают в зону options.zone (создаётся при нужде). Столбец,
 * которого нет в базе, удаляется; с options.keepHidden скрытые остаются.
 * Составной внешний ключ даёт одну связь — по столбцу, который ссылается на
 * первичный ключ цели из одного столбца: диалект составных связей не знает.
 * Возвращает { state, changes }.
 */
export function syncSchema(source, columnRows, fkRows, options = {}) {
  const state = cloneState(source);
  const changes = [];
  const emptyBefore = new Set(state.zones.filter((zone) => !state.tables.some((table) => table.zone === zone.id)).map((zone) => zone.id));
  const added = [];
  const live = new Map();
  for (const [table, column, type, , pk, unique] of columnRows) {
    if (!live.has(table)) live.set(table, []);
    live.get(table).push({ name: column, type, pk: truthy(pk), uk: truthy(unique) && !truthy(pk) });
  }

  for (const table of [...state.tables]) {
    if (live.has(table.id)) continue;
    state.tables = state.tables.filter((item) => item !== table);
    changes.push(`− таблица ${table.id}`);
  }

  for (const [id, columns] of live) {
    let table = state.tables.find((item) => item.id === id);
    if (!table) {
      const zone = ensureZone(state, options.zone || "новые");
      table = { id, zone: zone.id, note: "", x: 16, y: 36, columns: [] };
      state.tables.push(table);
      added.push(table);
      changes.push(`+ таблица ${id} → зона ${zone.id}`);
    }
    const next = columns.map((column) => {
      const old = table.columns.find((item) => item.name === column.name);
      if (!old) {
        changes.push(`${id}: + ${column.name} ${column.type}`);
        return { ...column, hidden: false };
      }
      if (old.type !== column.type) changes.push(`${id}: ${column.name} ${old.type} → ${column.type}`);
      if (Boolean(old.pk) !== column.pk) changes.push(`${id}: ${column.name} ${column.pk ? "+" : "−"} pk`);
      if (Boolean(old.uk) !== column.uk) changes.push(`${id}: ${column.name} ${column.uk ? "+" : "−"} unique`);
      return { ...old, type: column.type, pk: column.pk, uk: column.uk };
    });
    for (const old of table.columns) {
      if (columns.some((column) => column.name === old.name)) continue;
      if (options.keepHidden && old.hidden) {
        next.push(old);
        continue;
      }
      changes.push(`${id}: − ${old.name}`);
    }
    table.columns = next;
  }

  const pkOf = (table) => {
    const keys = (live.get(table) || []).filter((column) => column.pk);
    return keys.length === 1 ? keys[0].name : null;
  };
  const key = (ref) => `${ref.from}.${ref.fromCol}>${ref.to}.${ref.toCol}`;
  const wanted = [];
  for (const [table, column, target, targetColumn, rule, , count] of fkRows) {
    if (Number(count) > 1 && targetColumn !== pkOf(target)) continue;
    const ref = { from: table, fromCol: column, to: target, toCol: targetColumn, onDelete: String(rule).toUpperCase() };
    // Одна и та же пара столбцов бывает и в одиночном, и в составном ключе.
    if (!wanted.some((item) => key(item) === key(ref))) wanted.push(ref);
  }
  const refs = [];
  for (const ref of wanted) {
    const old = state.refs.find((item) => key(item) === key(ref));
    if (!old) changes.push(`+ связь ${key(ref)}`);
    else if (String(old.onDelete).toUpperCase() !== ref.onDelete) changes.push(`связь ${key(ref)}: ${old.onDelete} → ${ref.onDelete}`);
    refs.push({ fromSide: "auto", toSide: "auto", ...old, ...ref });
  }
  for (const old of state.refs) {
    if (!wanted.some((ref) => key(ref) === key(old))) changes.push(`− связь ${key(old)}`);
  }
  state.refs = refs;
  for (const zoneId of new Set(added.map((table) => table.zone))) {
    placeAdded(state, added.filter((table) => table.zone === zoneId));
    fitZone(state, state.zones.find((item) => item.id === zoneId));
  }
  // Зона, опустевшая после сверки, уходит; пустые зоны, заведённые вручную, остаются.
  state.zones = state.zones.filter((zone) => emptyBefore.has(zone.id) || state.tables.some((table) => table.zone === zone.id));
  return { state, changes };
}

/** placeAdded — новые таблицы зоны встают сеткой по три под уже стоящими. */
function placeAdded(state, added) {
  const height = (table) => 28 + table.columns.length * 20 + 16;
  const old = state.tables.filter((table) => table.zone === added[0].zone && !added.includes(table));
  let top = Math.max(36, ...old.map((table) => table.y + height(table) + 36));
  for (let i = 0; i < added.length; i += 3) {
    const row = added.slice(i, i + 3);
    row.forEach((table, c) => {
      table.x = 16 + c * 236;
      table.y = top;
    });
    top += Math.max(...row.map(height)) + 36;
  }
}

function ensureZone(state, id) {
  let zone = state.zones.find((item) => item.id === id);
  if (zone) return zone;
  const bottom = Math.max(0, ...state.zones.map((item) => item.y + item.h));
  zone = { id, title: id, color: nextZoneColor(state.zones.length), x: 20, y: bottom + 64, w: 320, h: 200 };
  state.zones.push(zone);
  return zone;
}
