import { autoplace } from "./layout.js";
import { DEFAULT_COLOR, normalizeHex, zonePaint } from "./colors.js";

const LAYOUT_ZONE =
  /^\/\/\s*(?:mes2-layout|layout)\s+zone\s+(\S+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(\S+)\s*$/;
const LAYOUT_TABLE =
  /^\/\/\s*(?:mes2-layout|layout)\s+table\s+(\S+)\s+(\S+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/;
const LAYOUT_REF =
  /^\/\/\s*(?:mes2-layout|layout)\s+ref\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(left|right|auto)\s+(left|right|auto)\s*$/;

export function emptyState() {
  return { zones: [], tables: [], refs: [] };
}

export function parseDbml(source) {
  const layout = readLayout(source);
  const state = emptyState();
  const groups = [];
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    i += 1;
    if (!line || line.startsWith("//")) continue;
    if (/^Project\b/.test(line) || /^Enum\b/.test(line)) {
      i = skipBlock(lines, i - 1) + 1;
      continue;
    }
    if (/^TableGroup\b/.test(line)) {
      const name = firstIdent(line.replace(/^TableGroup\s+/, ""));
      const body = readBlock(lines, i - 1);
      i = body.next;
      const members = body.lines.map((item) => firstIdent(item)).filter(Boolean);
      groups.push({ name, members });
      continue;
    }
    if (/^Table\b/.test(line)) {
      const name = firstIdent(line.replace(/^Table\s+/, ""));
      const colorMatch = line.match(/headercolor:\s*(#[0-9A-Fa-f]+)/i);
      const body = readBlock(lines, i - 1);
      i = body.next;
      const table = {
        id: name,
        zone: "",
        note: "",
        x: 16,
        y: 16,
        headerColor: colorMatch ? normalizeHex(colorMatch[1]) : "",
        columns: [],
      };
      let skipNested = 0;
      for (const item of body.lines) {
        if (/^indexes\b/i.test(item) || /^Note:\s*'''/.test(item)) {
          skipNested += 1;
          continue;
        }
        if (skipNested) {
          if (item.includes("'''") || item === "}") skipNested -= 1;
          continue;
        }
        const note = item.match(/^Note:\s*'([\s\S]*)'\s*$/);
        if (note) {
          table.note = note[1].replaceAll("\\'", "'");
          continue;
        }
        const column = parseColumn(item);
        if (column) table.columns.push(column);
      }
      state.tables.push(table);
      continue;
    }
    if (/^Ref:/.test(line)) {
      const ref = parseRef(line);
      if (ref) state.refs.push(ref);
    }
  }

  for (const group of groups) {
    const painted = state.tables.find((table) => group.members.includes(table.id) && table.headerColor);
    state.zones.push({
      id: group.name,
      title: group.name,
      color: painted ? painted.headerColor : DEFAULT_COLOR,
      x: 20,
      y: 20,
      w: 320,
      h: 200,
    });
    for (const member of group.members) {
      const table = state.tables.find((item) => item.id === member);
      if (table) table.zone = group.name;
    }
  }

  for (const table of state.tables) {
    if (table.zone) continue;
    if (!state.zones.length) {
      state.zones.push({
        id: "default",
        title: "Схема",
        color: table.headerColor || DEFAULT_COLOR,
        x: 20,
        y: 20,
        w: 320,
        h: 200,
      });
    }
    table.zone = state.zones[0].id;
  }

  applyLayout(state, layout);
  if (!layout.zones.length && state.tables.length) {
    autoplace(state);
  }
  return state;
}

export function toDbml(state) {
  const lines = ["// Редактор DBML", ""];
  for (const table of state.tables) {
    const zone = state.zones.find((item) => item.id === table.zone);
    const header = zonePaint(zone?.color).header;
    lines.push(`Table ${quoteIdent(table.id)} [headercolor: ${header}] {`);
    for (const column of table.columns) {
      const flags = [];
      if (column.pk) flags.push("pk");
      if (column.uk) flags.push("unique");
      if (column.hidden) flags.push("hidden");
      const suffix = flags.length ? ` [${flags.join(", ")}]` : "";
      lines.push(`  ${column.name} ${column.type || "text"}${suffix}`);
    }
    if (table.note) {
      lines.push(`  Note: '${escapeNote(table.note)}'`);
    }
    lines.push("}", "");
  }
  for (const zone of state.zones) {
    const members = state.tables.filter((table) => table.zone === zone.id);
    if (!members.length) continue;
    lines.push(`TableGroup ${quoteIdent(zone.title || zone.id)} {`);
    for (const table of members) {
      lines.push(`  ${quoteIdent(table.id)}`);
    }
    lines.push("}", "");
  }
  for (const ref of state.refs) {
    const del = String(ref.onDelete || "RESTRICT").toLowerCase();
    lines.push(
      `Ref: ${quoteIdent(ref.from)}.${ref.fromCol} > ${quoteIdent(ref.to)}.${ref.toCol} [delete: ${del}]`,
    );
  }
  lines.push("");
  for (const zone of state.zones) {
    lines.push(
      `// layout zone ${encodeToken(zone.id)} ${num(zone.x)} ${num(zone.y)} ${num(zone.w)} ${num(zone.h)} ${normalizeHex(zone.color)}`,
    );
  }
  for (const table of state.tables) {
    lines.push(
      `// layout table ${encodeToken(table.id)} ${encodeToken(table.zone)} ${num(table.x)} ${num(table.y)}`,
    );
  }
  for (const ref of state.refs) {
    lines.push(
      `// layout ref ${encodeToken(ref.from)} ${encodeToken(ref.fromCol)} ${encodeToken(ref.to)} ${encodeToken(ref.toCol)} ${sideToken(ref.fromSide)} ${sideToken(ref.toSide)}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function sideToken(value) {
  return value === "left" || value === "right" ? value : "auto";
}

function parseColumn(line) {
  const match = line.match(/^([A-Za-z_][\w]*)\s+([^[]+?)(?:\s+\[(.*)\])?\s*$/);
  if (!match) return null;
  const attrs = match[3] || "";
  return {
    name: match[1],
    type: match[2].trim(),
    pk: /\bpk\b/i.test(attrs),
    uk: /\bunique\b/i.test(attrs),
    hidden: /\bhidden\b/i.test(attrs),
  };
}

function parseRef(line) {
  const match = line.match(
    /^Ref:\s*("?[^.\s"]+"?|\w+)\.(\w+)\s*[><-]+\s*("?[^.\s"]+"?|\w+)\.(\w+)(?:\s*\[delete:\s*([^\]]+)\])?/i,
  );
  if (!match) return null;
  return {
    from: unquote(match[1]),
    fromCol: match[2],
    to: unquote(match[3]),
    toCol: match[4],
    onDelete: String(match[5] || "RESTRICT")
      .trim()
      .replaceAll("_", " ")
      .toUpperCase(),
    fromSide: "auto",
    toSide: "auto",
  };
}

function firstIdent(text) {
  const quoted = String(text).trim().match(/^"([^"]+)"/);
  if (quoted) return quoted[1];
  const plain = String(text).trim().match(/^([^\s{[]+)/);
  return plain ? plain[1] : "";
}

function unquote(value) {
  return String(value).replaceAll(/^"|"$/g, "");
}

function readBlock(lines, start) {
  const collected = [];
  let depth = 0;
  let started = false;
  let i = start;
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.includes("{")) {
      depth += (line.match(/\{/g) || []).length;
      started = true;
      const after = line.slice(line.indexOf("{") + 1).trim();
      if (after && after !== "}") collected.push(after);
      if (line.includes("}")) depth -= (line.match(/\}/g) || []).length;
      if (started && depth <= 0) return { lines: collected, next: i + 1 };
      continue;
    }
    if (!started) continue;
    if (line.includes("{")) depth += 1;
    if (line.includes("}")) {
      depth -= 1;
      if (depth <= 0) return { lines: collected, next: i + 1 };
      continue;
    }
    collected.push(line.trim());
  }
  return { lines: collected, next: i };
}

function skipBlock(lines, start) {
  const body = readBlock(lines, start);
  return body.next - 1;
}

function quoteIdent(name) {
  return /[^A-Za-z0-9_]/.test(name) ? `"${name.replaceAll('"', '\\"')}"` : name;
}

function escapeNote(text) {
  return String(text).replaceAll("'", "\\'");
}

function encodeToken(value) {
  return String(value).replaceAll(" ", "␣");
}

function decodeToken(value) {
  return String(value).replaceAll("␣", " ");
}

function num(value) {
  return Math.round(Number(value) || 0);
}

function readLayout(source) {
  const zones = [];
  const tables = [];
  const refs = [];
  for (const line of source.split(/\r?\n/)) {
    const zone = line.match(LAYOUT_ZONE);
    if (zone) {
      zones.push({
        id: decodeToken(zone[1]),
        x: Number(zone[2]),
        y: Number(zone[3]),
        w: Number(zone[4]),
        h: Number(zone[5]),
        color: normalizeHex(zone[6]),
      });
    }
    const table = line.match(LAYOUT_TABLE);
    if (table) {
      tables.push({
        id: decodeToken(table[1]),
        zone: decodeToken(table[2]),
        x: Number(table[3]),
        y: Number(table[4]),
      });
    }
    const ref = line.match(LAYOUT_REF);
    if (ref) {
      refs.push({
        from: decodeToken(ref[1]),
        fromCol: decodeToken(ref[2]),
        to: decodeToken(ref[3]),
        toCol: decodeToken(ref[4]),
        fromSide: ref[5],
        toSide: ref[6],
      });
    }
  }
  return { zones, tables, refs };
}

function applyLayout(state, layout) {
  for (const item of layout.zones) {
    const zone = state.zones.find((entry) => entry.id === item.id);
    if (!zone) continue;
    Object.assign(zone, item);
  }
  for (const item of layout.tables) {
    const table = state.tables.find((entry) => entry.id === item.id);
    if (!table) continue;
    table.zone = item.zone;
    table.x = item.x;
    table.y = item.y;
  }
  for (const item of layout.refs) {
    const ref = state.refs.find(
      (entry) =>
        entry.from === item.from &&
        entry.fromCol === item.fromCol &&
        entry.to === item.to &&
        entry.toCol === item.toCol,
    );
    if (!ref) continue;
    ref.fromSide = item.fromSide;
    ref.toSide = item.toSide;
  }
}
