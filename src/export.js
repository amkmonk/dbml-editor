import { zonePaint } from "./colors.js";

const TABLE_W = 196;
const HEAD_H = 28;
const ROW_H = 20;
const SCALE = 2;

export function fileStem(name) {
  return String(name || "схема").replace(/\.(dbml|txt|sql|png)$/i, "") || "схема";
}

export function sqlIdent(name) {
  const value = String(name || "");
  if (/^[a-z_][a-z0-9_]*$/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

export function toSql(state) {
  const lines = ["-- Выгрузка схемы из редактора DBML", ""];
  for (const table of state.tables) {
    const cols = table.columns.map((column) => {
      const parts = [`  ${sqlIdent(column.name)} ${column.type || "text"}`];
      if (column.pk || column.uk) parts.push("NOT NULL");
      return parts.join(" ");
    });
    const pks = table.columns.filter((column) => column.pk).map((column) => sqlIdent(column.name));
    const uks = table.columns.filter((column) => column.uk && !column.pk);
    if (pks.length) {
      cols.push(`  CONSTRAINT ${sqlIdent(`${table.id}_pkey`)} PRIMARY KEY (${pks.join(", ")})`);
    }
    for (const column of uks) {
      cols.push(
        `  CONSTRAINT ${sqlIdent(`${table.id}_${column.name}_key`)} UNIQUE (${sqlIdent(column.name)})`,
      );
    }
    if (table.note) {
      lines.push(`-- ${table.id}: ${String(table.note).replaceAll(/\s+/g, " ")}`);
    }
    lines.push(`CREATE TABLE ${sqlIdent(table.id)} (`);
    lines.push(cols.join(",\n") || "  id text");
    lines.push(");", "");
  }
  state.refs.forEach((ref, index) => {
    const name = `${ref.from}_${ref.fromCol}_fkey`;
    const action = String(ref.onDelete || "RESTRICT").toUpperCase();
    lines.push(`ALTER TABLE ${sqlIdent(ref.from)}`);
    lines.push(`  ADD CONSTRAINT ${sqlIdent(name || `fk_${index}`)}`);
    lines.push(
      `  FOREIGN KEY (${sqlIdent(ref.fromCol)}) REFERENCES ${sqlIdent(ref.to)} (${sqlIdent(ref.toCol)})`,
    );
    lines.push(`  ON DELETE ${action};`, "");
  });
  return lines.join("\n");
}

export function tableBoardPos(state, table) {
  const zone = state.zones.find((item) => item.id === table.zone);
  return { x: (zone?.x || 0) + table.x, y: (zone?.y || 0) + table.y };
}

export function tableHeight(table) {
  const note = table.note ? 22 : 0;
  return HEAD_H + Math.max(table.columns.length, 1) * ROW_H + note + 6;
}

export function schemaBounds(state) {
  let minX = 0;
  let minY = 0;
  let maxX = 480;
  let maxY = 320;
  for (const zone of state.zones) {
    minX = Math.min(minX, zone.x);
    minY = Math.min(minY, zone.y);
    maxX = Math.max(maxX, zone.x + zone.w);
    maxY = Math.max(maxY, zone.y + zone.h);
  }
  for (const table of state.tables) {
    const pos = tableBoardPos(state, table);
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + TABLE_W);
    maxY = Math.max(maxY, pos.y + tableHeight(table));
  }
  const pad = 32;
  return {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(1, Math.round(maxX - minX + pad * 2)),
    h: Math.max(1, Math.round(maxY - minY + pad * 2)),
  };
}

export function resolveSide(explicit, fromBox, toBox, which) {
  if (explicit === "left" || explicit === "right") return explicit;
  if (which === "from") return toBox.x >= fromBox.x ? "right" : "left";
  return toBox.x >= fromBox.x ? "left" : "right";
}

export function paintSchema(ctx, state, origin = { x: 0, y: 0 }) {
  ctx.save();
  ctx.translate(-origin.x, -origin.y);
  for (const zone of state.zones) {
    const paint = zonePaint(zone.color);
    roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 10);
    ctx.fillStyle = paint.bg;
    ctx.fill();
    ctx.strokeStyle = paint.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = paint.title;
    ctx.font = "700 12px Segoe UI, system-ui, sans-serif";
    ctx.fillText(String(zone.title || zone.id).toUpperCase(), zone.x + 16, zone.y + 22);
  }
  for (const ref of state.refs) {
    const from = state.tables.find((table) => table.id === ref.from);
    const to = state.tables.find((table) => table.id === ref.to);
    if (!from || !to) continue;
    const aPos = tableBoardPos(state, from);
    const bPos = tableBoardPos(state, to);
    const fromBox = { x: aPos.x, y: aPos.y, w: TABLE_W, h: tableHeight(from) };
    const toBox = { x: bPos.x, y: bPos.y, w: TABLE_W, h: tableHeight(to) };
    const fromSide = resolveSide(ref.fromSide, fromBox, toBox, "from");
    const toSide = resolveSide(ref.toSide, fromBox, toBox, "to");
    const p1 = fieldPoint(state, from, ref.fromCol, fromSide);
    const p2 = fieldPoint(state, to, ref.toCol, toSide);
    const dx = Math.max(36, Math.abs(p2.x - p1.x) * 0.4);
    const sx = fromSide === "right" ? 1 : -1;
    const tx = toSide === "right" ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.bezierCurveTo(p1.x + sx * dx, p1.y, p2.x + tx * dx, p2.y, p2.x, p2.y);
    ctx.strokeStyle = zonePaint(state.zones.find((zone) => zone.id === from.zone)?.color).header;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.7;
    if (String(ref.onDelete).toUpperCase() === "SET NULL") ctx.setLineDash([5, 4]);
    else ctx.setLineDash([]);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }
  for (const table of state.tables) {
    if (!state.zones.some((zone) => zone.id === table.zone)) continue;
    const pos = tableBoardPos(state, table);
    const paint = zonePaint(state.zones.find((zone) => zone.id === table.zone)?.color);
    const height = tableHeight(table);
    roundRect(ctx, pos.x, pos.y, TABLE_W, height, 8);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#cfc8c2";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = paint.header;
    ctx.font = "650 13px Segoe UI, system-ui, sans-serif";
    ctx.fillText(table.id, pos.x + 8, pos.y + 18);
    table.columns.forEach((column, index) => {
      const y = pos.y + HEAD_H + index * ROW_H;
      ctx.fillStyle = "#f3f1ef";
      ctx.fillRect(pos.x + 1, y, TABLE_W - 2, 1);
      ctx.fillStyle = "#1c1917";
      ctx.font = "12px ui-monospace, Consolas, monospace";
      ctx.fillText(column.name, pos.x + 10, y + 14);
      ctx.fillStyle = "#57534e";
      ctx.font = "11px Segoe UI, system-ui, sans-serif";
      ctx.fillText(column.type || "text", pos.x + 118, y + 14);
      if (column.pk || column.uk) {
        ctx.fillStyle = column.pk ? "#b45309" : "#1d4ed8";
        ctx.font = "700 10px Segoe UI, system-ui, sans-serif";
        ctx.fillText(column.pk ? "PK" : "UK", pos.x + 168, y + 14);
      }
    });
  }
  ctx.restore();
}

export function createSchemaCanvas(state, documentRef = globalThis.document) {
  const bounds = schemaBounds(state);
  const canvas = documentRef.createElement("canvas");
  canvas.width = bounds.w * SCALE;
  canvas.height = bounds.h * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, bounds.w, bounds.h);
  paintSchema(ctx, state, bounds);
  return canvas;
}

export function toPngBlob(state, documentRef = globalThis.document) {
  const canvas = createSchemaCanvas(state, documentRef);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Не удалось собрать PNG"));
    }, "image/png");
  });
}

function fieldPoint(state, table, column, side) {
  const pos = tableBoardPos(state, table);
  const index = Math.max(0, table.columns.findIndex((item) => item.name === column));
  return {
    x: side === "left" ? pos.x : pos.x + TABLE_W,
    y: pos.y + HEAD_H + index * ROW_H + ROW_H / 2,
  };
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
