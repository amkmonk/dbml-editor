// Проверка файла: связи на несуществующее, таблицы вне групп, наложения.
// Модуль без DOM: им пользуется CLI.

import { TABLE_W, tableHeight } from "./arrange.js";

/**
 * checkSchema — ошибки и предупреждения по разобранному состоянию и исходному
 * тексту. Ошибки: связь ссылается на неизвестную таблицу или поле, таблица
 * повторяется. Предупреждения: таблица не входит ни в одну TableGroup (редактор
 * кладёт её в первую зону), у таблицы нет строки раскладки, таблицы
 * накладываются, таблица выходит за свою зону.
 */
export function checkSchema(state, source) {
  const errors = [];
  const warnings = [];
  const ids = new Map();
  for (const table of state.tables) ids.set(table.id, (ids.get(table.id) || 0) + 1);
  for (const [id, count] of ids) if (count > 1) errors.push(`таблица ${id} объявлена ${count} раза`);

  const hasColumn = (tableId, column) => state.tables.find((table) => table.id === tableId)?.columns.some((item) => item.name === column);
  for (const ref of state.refs) {
    const name = `${ref.from}.${ref.fromCol} > ${ref.to}.${ref.toCol}`;
    if (!ids.has(ref.from) || !ids.has(ref.to)) errors.push(`связь ${name}: нет таблицы`);
    else if (!hasColumn(ref.from, ref.fromCol) || !hasColumn(ref.to, ref.toCol)) errors.push(`связь ${name}: нет поля`);
  }

  const text = String(source || "");
  const grouped = new Set();
  for (const block of text.matchAll(/^TableGroup\b[^{]*\{([\s\S]*?)^\}/gm)) {
    for (const line of block[1].split(/\r?\n/)) {
      const name = line.trim().replace(/^"|"$/g, "");
      if (name) grouped.add(name);
    }
  }
  const placed = new Set([...text.matchAll(/^\/\/\s*(?:mes2-layout|layout)\s+table\s+(\S+)/gm)].map((m) => m[1].replaceAll("␣", " ")));
  for (const table of state.tables) {
    if (!grouped.has(table.id)) warnings.push(`таблица ${table.id} не входит ни в одну TableGroup`);
    if (text && !placed.has(table.id)) warnings.push(`у таблицы ${table.id} нет строки // layout table`);
  }

  const zones = new Map(state.zones.map((zone) => [zone.id, zone]));
  const boxes = state.tables.map((table) => {
    const zone = zones.get(table.zone);
    return { table, zone, x: (zone?.x || 0) + table.x, y: (zone?.y || 0) + table.y, h: tableHeight(table) };
  });
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i];
    if (a.zone && (a.x < a.zone.x || a.y < a.zone.y || a.x + TABLE_W > a.zone.x + a.zone.w || a.y + a.h > a.zone.y + a.zone.h)) {
      warnings.push(`таблица ${a.table.id} выходит за зону ${a.zone.id}`);
    }
    for (let j = i + 1; j < boxes.length; j += 1) {
      const b = boxes[j];
      if (a.x < b.x + TABLE_W && b.x < a.x + TABLE_W && a.y < b.y + b.h && b.y < a.y + a.h) {
        warnings.push(`таблицы ${a.table.id} и ${b.table.id} накладываются`);
      }
    }
  }
  return { errors, warnings };
}
