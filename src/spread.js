// Раздвижка доски, когда таблицы выросли (показаны скрытые столбцы): сдвиги
// только для отображения, сохранённые координаты не меняются.

const TABLE_W = 196;
const MIN_GAP = 12;
const ZONE_PAD = 16;

/**
 * spread — сдвиги таблиц и зон, чтобы выросшие таблицы не наезжали на соседей.
 * tables — [{ id, zone, x, y, base, shown }]: base — высота, под которую
 * расставлена доска, shown — высота сейчас. zones — [{ id, x, y, w, h }].
 * Таблица сдвигается вниз, если над ней в том же столбце (перекрытие по x)
 * стоит выросшая таблица; прежний зазор между ними сохраняется. Зона
 * вытягивается под содержимое, зоны ниже неё сдвигаются так же.
 * Возвращает { tables: Map(id → dy), zones: Map(id → { dy, dh }) }.
 */
export function spread(zones, tables) {
  const tableShift = new Map();
  const grow = new Map();
  for (const zone of zones) {
    const members = tables.filter((table) => table.zone === zone.id).sort((a, b) => a.y - b.y || a.x - b.x);
    const top = new Map();
    let bottom = 0;
    for (const table of members) {
      let y = table.y;
      for (const above of members) {
        if (above === table) break;
        if (Math.abs(above.x - table.x) >= TABLE_W || above.y >= table.y) continue;
        const gap = Math.max(MIN_GAP, table.y - (above.y + above.base));
        y = Math.max(y, top.get(above.id) + above.shown + gap);
      }
      top.set(table.id, y);
      tableShift.set(table.id, y - table.y);
      bottom = Math.max(bottom, y + table.shown);
    }
    grow.set(zone.id, Math.max(0, bottom + ZONE_PAD - zone.h));
  }

  const zoneShift = new Map();
  const ordered = [...zones].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const zone of ordered) {
    let y = zone.y;
    for (const above of ordered) {
      if (above === zone) break;
      if (above.x >= zone.x + zone.w || zone.x >= above.x + above.w || above.y >= zone.y) continue;
      const gap = Math.max(ZONE_PAD, zone.y - (above.y + above.h));
      y = Math.max(y, above.y + zoneShift.get(above.id) + above.h + grow.get(above.id) + gap);
    }
    zoneShift.set(zone.id, y - zone.y);
  }
  return {
    tables: tableShift,
    zones: new Map(zones.map((zone) => [zone.id, { dy: zoneShift.get(zone.id), dh: grow.get(zone.id) }])),
  };
}
