const ICONS = {
  zone: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/>',
  table: '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M2.5 6h11M2.5 10h11M8 6v7.5"/>',
  key: '<circle cx="6" cy="8" r="2.2"/><path d="M8 8h5.2l1.2 1.2v1.3H13V9.3h-1.2"/>',
  ref: '<circle cx="4.2" cy="8" r="1.6"/><circle cx="11.8" cy="8" r="1.6"/><path d="M5.8 8h4.4"/>',
  uuid: '<rect x="3" y="3" width="10" height="10" rx="2"/><path d="M6 8h4M8 6v4"/>',
  text: '<path d="M3.5 4.5h9M5 4.5v7M11 4.5v7M6.5 11.5h3"/>',
  int: '<path d="M5 3.5v9M8.5 4.5 11 8l-2.5 3.5"/>',
  num: '<path d="M3.5 11.5 6 4.5h1.2L10 11.5M4.6 9h4.2M11 4.5v7"/>',
  bool: '<rect x="3" y="3.5" width="10" height="9" rx="2"/><path d="M5.5 8.2 7.2 10l3.5-4.2"/>',
  date: '<rect x="3" y="3.5" width="10" height="9.5" rx="1"/><path d="M3 6.5h10M6 2.8v2.2M10 2.8v2.2"/>',
  time: '<circle cx="8" cy="8" r="5"/><path d="M8 5.2V8l2 1.4"/>',
  json: '<path d="M5 3.5c-1.4 0-2 1.2-2 2.5s.6 2.5 2 2.5M5 12.5c-1.4 0-2-1.2-2-2.5s.6-2.5 2-2.5M11 3.5c1.4 0 2 1.2 2 2.5s-.6 2.5-2 2.5M11 12.5c1.4 0 2-1.2 2-2.5s-.6-2.5-2-2.5"/>',
  bin: '<path d="M4 11.5V4.5h3.2l.8 1.4H12v5.6z"/>',
  other: '<path d="M4 8h8M8 4v8"/>',
  chevron: '<path d="M6 4.5 10 8 6 11.5"/>',
};

export function iconSvg(name) {
  const key = ICONS[name] ? name : "other";
  return `<svg class="ico ico-${key}" viewBox="0 0 16 16" aria-hidden="true">${ICONS[key]}</svg>`;
}

export function fieldKind(type) {
  const value = String(type || "").toLowerCase();
  if (/uuid|guid/.test(value)) return "uuid";
  if (/bool/.test(value)) return "bool";
  if (/timestamptz|timestamp|datetime/.test(value)) return "time";
  if (/\bdate\b/.test(value)) return "date";
  if (/\btime\b/.test(value)) return "time";
  if (/json/.test(value)) return "json";
  if (/int|serial|bigint|smallint|tinyint/.test(value)) return "int";
  if (/numeric|decimal|float|double|real|money/.test(value)) return "num";
  if (/text|varchar|char|string|citext/.test(value)) return "text";
  if (/bytea|blob|binary/.test(value)) return "bin";
  return "other";
}

export function fieldIcon(column) {
  if (column?.pk) return "key";
  return fieldKind(column?.type);
}
