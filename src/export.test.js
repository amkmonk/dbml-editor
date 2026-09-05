import { test } from "node:test";
import assert from "node:assert/strict";
import { fileStem, paintSchema, resolveSide, schemaBounds, sqlIdent, toSql } from "./export.js";

const sample = {
  zones: [{ id: "auth", title: "Полномочия", color: "#6d4caf", x: 10, y: 20, w: 400, h: 220 }],
  tables: [
    {
      id: "users",
      zone: "auth",
      note: "Учётные записи",
      x: 16,
      y: 16,
      columns: [
        { name: "id", type: "uuid", pk: true, uk: false, hidden: false },
        { name: "email", type: "text", pk: false, uk: true, hidden: false },
      ],
    },
    {
      id: "User Profile",
      zone: "auth",
      x: 220,
      y: 16,
      columns: [{ name: "user_id", type: "uuid", pk: false, uk: false, hidden: false }],
    },
  ],
  refs: [
    {
      from: "User Profile",
      fromCol: "user_id",
      to: "users",
      toCol: "id",
      onDelete: "SET NULL",
    },
  ],
};

test("имя файла без расширения", () => {
  assert.equal(fileStem("схема.dbml"), "схема");
  assert.equal(fileStem("report.PNG"), "report");
});

test("SQL кавычит нестандартные имена и пишет ключи", () => {
  const sql = toSql(sample);
  assert.match(sql, /CREATE TABLE users \(/);
  assert.match(sql, /PRIMARY KEY \(id\)/);
  assert.match(sql, /UNIQUE \(email\)/);
  assert.match(sql, /CREATE TABLE "User Profile"/);
  assert.match(sql, /FOREIGN KEY \(user_id\) REFERENCES users \(id\)/);
  assert.match(sql, /ON DELETE SET NULL/);
  assert.equal(sqlIdent("users"), "users");
  assert.equal(sqlIdent('odd"name'), '"odd""name"');
});

test("рамка схемы покрывает зоны и таблицы", () => {
  const box = schemaBounds(sample);
  assert.ok(box.w > 400);
  assert.ok(box.h > 220);
  assert.ok(box.x <= 10);
});

test("отрисовка PNG пишет таблицы и связи", () => {
  const texts = [];
  const strokes = [];
  const ctx = {
    save() {},
    restore() {},
    translate() {},
    beginPath() {},
    moveTo() {},
    bezierCurveTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    fillRect() {},
    setLineDash(value) {
      strokes.push(value);
    },
    fillText(text) {
      texts.push(String(text));
    },
    stroke() {},
  };
  paintSchema(ctx, sample, { x: 0, y: 0 });
  assert.ok(texts.some((text) => text.includes("ПОЛНОМОЧИЯ")));
  assert.ok(texts.includes("users"));
  assert.ok(texts.includes("User Profile"));
  assert.ok(texts.includes("email"));
  assert.ok(strokes.some((item) => item?.length));
});

test("стороны связи в PNG берутся из раскладки", () => {
  const curves = [];
  let lastMove = 0;
  const ctx = {
    save() {},
    restore() {},
    translate() {},
    beginPath() {},
    moveTo(x) {
      lastMove = x;
    },
    bezierCurveTo(c1x) {
      curves.push({ start: lastMove, c1x });
    },
    arcTo() {},
    closePath() {},
    fill() {},
    fillRect() {},
    setLineDash() {},
    fillText() {},
    stroke() {},
  };
  paintSchema(
    ctx,
    {
      zones: [{ id: "z", title: "Зона", color: "#111111", x: 0, y: 0, w: 500, h: 200 }],
      tables: [
        { id: "a", zone: "z", x: 20, y: 20, columns: [{ name: "id", type: "uuid" }] },
        { id: "b", zone: "z", x: 260, y: 20, columns: [{ name: "a_id", type: "uuid" }] },
      ],
      refs: [{ from: "a", fromCol: "id", to: "b", toCol: "a_id", fromSide: "left", toSide: "right" }],
    },
    { x: 0, y: 0 },
  );
  assert.equal(resolveSide("left", { x: 0 }, { x: 100 }, "from"), "left");
  assert.equal(resolveSide("auto", { x: 0 }, { x: 100 }, "from"), "right");
  assert.equal(curves.length, 1);
  assert.ok(curves[0].start < 40);
  assert.ok(curves[0].c1x < curves[0].start);
});
