import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldIcon, fieldKind, iconSvg } from "./icons.js";

test("тип поля выбирает иконку", () => {
  assert.equal(fieldKind("uuid"), "uuid");
  assert.equal(fieldKind("timestamptz"), "time");
  assert.equal(fieldKind("date"), "date");
  assert.equal(fieldKind("varchar(64)"), "text");
  assert.equal(fieldKind("bigint"), "int");
  assert.equal(fieldKind("numeric(10,2)"), "num");
  assert.equal(fieldKind("boolean"), "bool");
  assert.equal(fieldKind("jsonb"), "json");
  assert.equal(fieldKind("bytea"), "bin");
  assert.equal(fieldKind("mystery"), "other");
});

test("первичный ключ всегда ключ", () => {
  assert.equal(fieldIcon({ name: "id", type: "uuid", pk: true }), "key");
  assert.equal(fieldIcon({ name: "title", type: "text", pk: false }), "text");
});

test("иконка отдаёт svg", () => {
  assert.match(iconSvg("zone"), /viewBox="0 0 16 16"/);
  assert.match(iconSvg("unknown"), /ico-other/);
});
