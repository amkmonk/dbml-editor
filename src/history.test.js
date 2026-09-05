import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession, statesEqual } from "./history.js";

function memory() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test("undo и redo возвращают снимки", () => {
  const session = createSession(memory());
  session.reset({ n: 1 });
  assert.equal(session.commit({ n: 2 }), true);
  assert.equal(session.commit({ n: 2 }), false);
  assert.deepEqual(session.undo(), { n: 1 });
  assert.deepEqual(session.redo(), { n: 2 });
  assert.equal(session.canRedo(), false);
});

test("замена сессии стирает историю", () => {
  const storage = memory();
  const session = createSession(storage);
  session.reset({ n: 1 });
  session.commit({ n: 2 });
  session.persist({ filename: "a.dbml", mode: "edit", selected: null, catalogToggle: {}, savedJson: "{}" });
  assert.ok(storage.getItem("dbml-editor-session"));
  session.reset({ n: 9 });
  session.persist({ filename: "b.dbml", mode: "view", selected: null, catalogToggle: {}, savedJson: "{}" });
  const restored = session.restore();
  assert.equal(restored.filename, "b.dbml");
  assert.deepEqual(session.snapshot(), { n: 9 });
  assert.equal(session.canUndo(), false);
});

test("сравнение снимков не зависит от ссылки", () => {
  assert.equal(statesEqual({ a: 1 }, { a: 1 }), true);
  assert.equal(statesEqual({ a: 1 }, { a: 2 }), false);
});

test("пустой current после F5 поднимается из истории", () => {
  const storage = memory();
  const session = createSession(storage);
  const full = {
    zones: [{ id: "z1", title: "Зона", color: "#111", x: 0, y: 0, w: 10, h: 10 }],
    tables: [],
    refs: [],
  };
  session.reset(full);
  session.commit({ zones: [], tables: [], refs: [] });
  session.persist({ filename: "a.dbml", mode: "view", selected: null, catalogToggle: {}, savedJson: "{}" });
  const other = createSession(storage);
  const restored = other.restore();
  assert.ok(restored);
  assert.deepEqual(other.snapshot(), full);
  assert.equal(other.canUndo(), false);
});

test("persist не затирает схему пустым state", () => {
  const storage = memory();
  const session = createSession(storage);
  const full = { zones: [{ id: "z1" }], tables: [], refs: [] };
  session.reset(full);
  session.persist({
    filename: "a.dbml",
    mode: "view",
    selected: null,
    catalogToggle: {},
    savedJson: "{}",
    state: { zones: [], tables: [], refs: [] },
  });
  assert.deepEqual(session.snapshot(), full);
});
