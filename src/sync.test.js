import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDbml } from "./dbml.js";
import { parseRows, syncSchema } from "./sync.js";

const source = `
Table users [headercolor: #6d4caf] {
  id uuid [pk]
  email text [unique, note: 'рабочая почта']
  password text [hidden]
  uq_users_email unique [hidden]
  Note: 'Учётные записи'
}
Table legacy {
  id uuid [pk]
}
TableGroup auth {
  users
}
TableGroup old {
  legacy
}
Ref: legacy.id > users.id [delete: cascade]
// layout zone auth 20 20 400 300 #6d4caf
// layout zone old 500 20 300 200 #c4921a
// layout table users auth 16 36
// layout table legacy old 16 36
// layout ref legacy id users id left right
`;

const columns = parseRows(`
users|id|uuid|1|t|f
users|email|text|2|f|t
users|status|user_status|3|f|f
posts|id|uuid|1|t|f
posts|user_id|uuid|2|f|f
posts|route_id|uuid|3|f|f
routes|id|uuid|1|t|f
routes|version|bigint|2|t|f
`);

const fks = parseRows(`
posts|user_id|users|id|CASCADE|fk_posts_user|1
posts|route_id|routes|id|RESTRICT|fk_posts_route|2
posts|id|routes|version|RESTRICT|fk_posts_route|2
`);

test("сверка берёт столбцы и связи из базы, заметки и скрытие — из файла", () => {
  const { state, changes } = syncSchema(parseDbml(source), columns, fks);
  const users = state.tables.find((table) => table.id === "users");
  assert.deepEqual(
    users.columns.map((column) => column.name),
    ["id", "email", "status"],
  );
  assert.equal(users.note, "Учётные записи");
  assert.equal(users.columns[1].note, "рабочая почта");
  assert.equal(users.columns[1].uk, true);
  assert.equal(users.x, 16);
  assert.ok(!state.tables.some((table) => table.id === "legacy"));
  assert.ok(!state.zones.some((zone) => zone.id === "old"), "опустевшая зона удаляется");
  assert.ok(changes.includes("users: − password"));
  assert.ok(changes.includes("users: + status user_status"));
  assert.ok(changes.includes("− таблица legacy"));
  assert.ok(!changes.some((item) => item.startsWith("users: email")), "unique у email совпадает с базой");
});

test("скрытые столбцы без пары в базе остаются с keepHidden", () => {
  const { state } = syncSchema(parseDbml(source), columns, fks, { keepHidden: true });
  const users = state.tables.find((table) => table.id === "users");
  assert.deepEqual(
    users.columns.map((column) => column.name),
    ["id", "email", "status", "password", "uq_users_email"],
  );
});

test("новые таблицы встают в свою зону, составной ключ даёт одну связь", () => {
  const { state } = syncSchema(parseDbml(source), columns, fks, { zone: "новые" });
  const zone = state.zones.find((item) => item.id === "новые");
  assert.ok(zone);
  const posts = state.tables.find((table) => table.id === "posts");
  const routes = state.tables.find((table) => table.id === "routes");
  assert.equal(posts.zone, "новые");
  assert.notDeepEqual([posts.x, posts.y], [routes.x, routes.y]);
  assert.ok(zone.w >= posts.x + 196 && zone.h >= posts.y);
  assert.deepEqual(
    state.refs.map((ref) => `${ref.from}.${ref.fromCol}>${ref.to}.${ref.toCol} ${ref.onDelete}`),
    ["posts.user_id>users.id CASCADE"],
    "составной ключ на таблицу без одиночного PK не показывается",
  );
});

test("выгрузка psql разбирается построчно", () => {
  assert.deepEqual(parseRows("a|b\r\n\r\nc|d\n"), [
    ["a", "b"],
    ["c", "d"],
  ]);
});

test("сверка сообщает о смене флагов ключей", () => {
  const state = parseDbml(source);
  const { changes } = syncSchema(state, parseRows("users|id|uuid|1|t|f\nusers|email|text|2|f|f\n"), []);
  assert.ok(changes.includes("users: email − unique"));
});
