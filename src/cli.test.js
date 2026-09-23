import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../bin/dbml-editor.js", import.meta.url));

function run(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

function tempFile(name, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dbml-cli-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
}

const schema = `
Table users {
  id uuid [pk]
}
Table posts {
  id uuid [pk]
  user_id uuid
}
TableGroup app {
  users
  posts
}
Ref: posts.user_id > users.id [delete: cascade]
`;

test("check считает объекты и ловит связь на несуществующее поле", () => {
  const ok = run("check", tempFile("ok.dbml", schema));
  assert.equal(ok.code, 0);
  assert.match(ok.out, /таблиц 2, зон 1, связей 1/);
  const broken = run("check", tempFile("broken.dbml", schema.replace("posts.user_id", "posts.author_id")));
  assert.equal(broken.code, 1);
  assert.match(broken.out, /ошибка: связь posts\.author_id > users\.id: нет поля/);
});

test("layout пишет раскладку в файл", () => {
  const file = tempFile("layout.dbml", schema);
  const result = run("layout", file, "--steps", "50", "--restarts", "1");
  assert.equal(result.code, 0);
  assert.match(result.out, /стало: пересечений 0/);
  const text = fs.readFileSync(file, "utf8");
  assert.match(text, /^\/\/ layout table users app \d+ \d+$/m);
  assert.match(text, /^\/\/ layout ref posts user_id users id (left|right) (left|right)$/m);
});

test("sync обновляет схему по выгрузке и сообщает изменения", () => {
  const file = tempFile("sync.dbml", schema);
  const columns = tempFile("cols.tsv", "users|id|uuid|1|t|f\nusers|name|text|2|f|f\nposts|id|uuid|1|t|f\nposts|user_id|uuid|2|f|f\n");
  const fks = tempFile("fks.tsv", "posts|user_id|users|id|RESTRICT|fk|1\n");
  const result = run("sync", file, "--columns", columns, "--fks", fks);
  assert.equal(result.code, 0);
  assert.match(result.out, /users: \+ name text/);
  assert.match(result.out, /связь posts\.user_id>users\.id: CASCADE → RESTRICT/);
  assert.match(fs.readFileSync(file, "utf8"), /Ref: posts\.user_id > users\.id \[delete: restrict\]/);
});

test("sql отдаёт запрос выгрузки, неизвестная команда — ошибка", () => {
  assert.match(run("sql", "columns").out, /information_schema\.columns/);
  const unknown = run("frobnicate", tempFile("x.dbml", schema));
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /неизвестная команда/);
});
