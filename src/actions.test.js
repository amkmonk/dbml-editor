import { test } from "node:test";
import assert from "node:assert/strict";
import { copySelection, moveColumn, moveColumnTo, moveSelection, relatedTableIds, uniqueToken } from "./actions.js";

test("уникальное имя не пересекается с занятыми", () => {
  assert.equal(uniqueToken(new Set(["users"]), "users"), "users_copy");
  assert.equal(uniqueToken(new Set(["users", "users_copy"]), "users"), "users_2");
});

test("копия зоны забирает таблицы и внутренние связи", () => {
  const state = {
    zones: [{ id: "auth", title: "Полномочия", color: "#6d4caf", x: 10, y: 20, w: 400, h: 300 }],
    tables: [
      {
        id: "users",
        zone: "auth",
        x: 16,
        y: 16,
        columns: [{ name: "id", type: "uuid", pk: true, uk: false, hidden: false }],
      },
      {
        id: "posts",
        zone: "auth",
        x: 240,
        y: 16,
        columns: [
          { name: "id", type: "uuid", pk: true, uk: false, hidden: false },
          { name: "user_id", type: "uuid", pk: false, uk: false, hidden: false },
        ],
      },
    ],
    refs: [{ from: "posts", fromCol: "user_id", to: "users", toCol: "id", fromSide: "left", toSide: "right" }],
  };
  const next = copySelection(state, { type: "zone", id: "auth" });
  assert.equal(next.type, "zone");
  assert.equal(state.zones.length, 2);
  assert.equal(state.tables.length, 4);
  assert.equal(state.refs.length, 2);
  const copied = state.tables.filter((table) => table.zone === next.id);
  assert.equal(copied.length, 2);
  assert.ok(state.refs.some((ref) => copied.some((table) => table.id === ref.from)));
});

test("копия таблицы копирует исходящие связи", () => {
  const state = {
    zones: [{ id: "z", title: "Зона", color: "#57534e", x: 0, y: 0, w: 200, h: 200 }],
    tables: [
      { id: "users", zone: "z", x: 0, y: 0, columns: [{ name: "id", type: "uuid", pk: true, uk: false, hidden: false }] },
      {
        id: "posts",
        zone: "z",
        x: 40,
        y: 0,
        columns: [{ name: "user_id", type: "uuid", pk: false, uk: false, hidden: false }],
      },
    ],
    refs: [{ from: "posts", fromCol: "user_id", to: "users", toCol: "id", fromSide: "auto", toSide: "auto" }],
  };
  const next = copySelection(state, { type: "table", id: "posts" });
  assert.equal(next.type, "table");
  assert.equal(state.tables.length, 3);
  assert.equal(state.refs.length, 2);
  assert.equal(state.refs[1].from, next.id);
  assert.equal(state.refs[1].to, "users");
});

test("стрелки сдвигают зону и таблицу", () => {
  const state = {
    zones: [{ id: "z", title: "Зона", color: "#57534e", x: 10, y: 20, w: 200, h: 200 }],
    tables: [{ id: "users", zone: "z", x: 8, y: 8, columns: [] }],
    refs: [],
  };
  assert.equal(moveSelection(state, { type: "zone", id: "z" }, 8, 0), true);
  assert.equal(state.zones[0].x, 18);
  assert.equal(moveSelection(state, { type: "table", id: "users" }, 0, -8), true);
  assert.equal(state.tables[0].y, 0);
});

test("поле сдвигается внутри таблицы и останавливается на краю", () => {
  const table = {
    columns: [
      { name: "id", type: "uuid" },
      { name: "title", type: "text" },
      { name: "note", type: "text" },
    ],
  };
  assert.equal(moveColumn(table, "title", -1), true);
  assert.deepEqual(table.columns.map((column) => column.name), ["title", "id", "note"]);
  assert.equal(moveColumn(table, "title", -1), false);
  assert.equal(moveColumnTo(table, "note", 0), true);
  assert.deepEqual(table.columns.map((column) => column.name), ["note", "title", "id"]);
  assert.equal(moveColumn(table, "missing", 1), false);
});

test("связанные таблицы включают оба конца связи", () => {
  const ids = relatedTableIds(
    { refs: [{ from: "posts", to: "users" }] },
    "posts",
  );
  assert.deepEqual([...ids].sort(), ["posts", "users"]);
});
