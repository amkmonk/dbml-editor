import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDbml, toDbml } from "./dbml.js";
import { normalizeHex, tint, zonePaint } from "./colors.js";

test("старые имена тем читаются как цвет", () => {
  assert.equal(normalizeHex("auth"), "#6d4caf");
  assert.equal(normalizeHex("#abc"), "#aabbcc");
});

test("фон зоны полупрозрачный", () => {
  assert.equal(tint("#c62828", 0.28), "rgba(198, 40, 40, 0.28)");
  assert.match(zonePaint("catalog").bg, /^rgba\(/);
});

test("стороны связи и цвет зоны сохраняются в раскладке", () => {
  const source = `
Table users [headercolor: #6d4caf] {
  id uuid [pk]
}
Table posts {
  id uuid [pk]
  user_id uuid
}
TableGroup "Полномочия" {
  users
  posts
}
Ref: posts.user_id > users.id [delete: restrict]
// mes2-layout zone Полномочия 10 20 400 300 auth
// layout table users Полномочия 16 16
// layout table posts Полномочия 240 16
// layout ref posts user_id users id left right
`;
  const state = parseDbml(source);
  assert.equal(state.zones[0].color, "#6d4caf");
  assert.equal(state.refs[0].fromSide, "left");
  assert.equal(state.refs[0].toSide, "right");
  const out = toDbml(state);
  assert.match(out, /\/\/ layout zone /);
  assert.match(out, /\/\/ layout ref posts user_id users id left right/);
  assert.doesNotMatch(out, /MES2/);
  assert.doesNotMatch(out, /mes2-layout/);
});

test("флаг скрытия поля пишется в DBML", () => {
  const source = `
Table users {
  id uuid [pk]
  password text [hidden]
}
TableGroup users {
  users
}
`;
  const state = parseDbml(source);
  const password = state.tables[0].columns.find((column) => column.name === "password");
  assert.equal(password.hidden, true);
  assert.match(toDbml(state), /password text \[hidden\]/);
});

test("заметка поля читается и пишется обратно", () => {
  const source = `
Table resources {
  alias text [note: 'не hidden: единственен среди активных строк']
  code text [unique, note: 'код SAP']
}
`;
  const state = parseDbml(source);
  const [alias, code] = state.tables[0].columns;
  assert.equal(alias.note, "не hidden: единственен среди активных строк");
  assert.equal(alias.hidden, false);
  assert.equal(code.uk, true);
  assert.equal(code.note, "код SAP");
  const again = parseDbml(toDbml(state));
  assert.equal(again.tables[0].columns[0].note, alias.note);
});

test("связь со знаком < читается в обратную сторону", () => {
  const state = parseDbml(`
Table users {
  id uuid [pk]
}
Table posts {
  user_id uuid
}
Ref: users.id < posts.user_id [delete: cascade]
`);
  assert.deepEqual(
    { from: state.refs[0].from, fromCol: state.refs[0].fromCol, to: state.refs[0].to, toCol: state.refs[0].toCol },
    { from: "posts", fromCol: "user_id", to: "users", toCol: "id" },
  );
  assert.equal(state.refs[0].onDelete, "CASCADE");
});
