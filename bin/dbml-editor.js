#!/usr/bin/env node
// CLI редактора для агентов и скриптов: проверка, раскладка и сверка .dbml с PostgreSQL.

import fs from "node:fs";
import { parseDbml, toDbml } from "../src/dbml.js";
import { arrange, layoutMetrics } from "../src/arrange.js";
import { checkSchema } from "../src/check.js";
import { INTROSPECTION_SQL, parseRows, syncSchema } from "../src/sync.js";

const HELP = `dbml-editor — работа с .dbml редактора без браузера

  check <файл>                   ошибки и предупреждения; код выхода 1 при ошибках
  stats <файл>                   пересечения связей и линии сквозь таблицы
  layout <файл> [--out <файл>]   разложить доску, как кнопка «Разложить»
         [--seed N] [--steps N] [--restarts N]
  sql columns|fks                запрос выгрузки схемы PostgreSQL для psql -At -F '|'
  sync <файл> --columns <tsv> --fks <tsv> [--out <файл>]
         [--zone <имя>] [--keep-hidden] [--layout]
                                 обновить таблицы, поля и связи по выгрузке базы,
                                 сохранив заметки, скрытие, зоны и раскладку

Без --out файл перезаписывается на месте. Запись идёт в каноническом виде
редактора — так же, как «Скачать → DBML».`;

function options(args) {
  const named = {};
  const plain = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      plain.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "keep-hidden" || key === "layout" || key === "help") named[key] = true;
    else named[key] = args[(i += 1)];
  }
  return { named, plain };
}

function read(file) {
  if (!file) fail("не указан файл");
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    fail(`не удалось прочитать ${file}: ${error.message}`);
  }
}

function fail(message) {
  console.error(`dbml-editor: ${message}`);
  process.exit(2);
}

function number(value, name) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) fail(`--${name} — целое число`);
  return parsed;
}

function arrangeOptions(named) {
  const result = {};
  for (const name of ["seed", "steps", "restarts"]) {
    const value = number(named[name], name);
    if (value !== undefined) result[name] = value;
  }
  return result;
}

function metricsLine(metrics) {
  return `пересечений ${metrics.crossings}, линий сквозь таблицы ${metrics.through}`;
}

function run(argv) {
  const [command, ...rest] = argv;
  const { named, plain } = options(rest);
  if (!command || command === "help" || named.help) {
    console.log(HELP);
    return 0;
  }
  if (command === "sql") {
    const kind = plain[0];
    if (!INTROSPECTION_SQL[kind]) fail("sql columns или sql fks");
    console.log(INTROSPECTION_SQL[kind]);
    return 0;
  }

  const file = plain[0];
  const source = read(file);
  const state = parseDbml(source);

  if (command === "check") {
    const { errors, warnings } = checkSchema(state, source);
    console.log(`таблиц ${state.tables.length}, зон ${state.zones.length}, связей ${state.refs.length}; ${metricsLine(layoutMetrics(state))}`);
    for (const item of errors) console.log(`ошибка: ${item}`);
    for (const item of warnings) console.log(`предупреждение: ${item}`);
    return errors.length ? 1 : 0;
  }
  if (command === "stats") {
    console.log(metricsLine(layoutMetrics(state)));
    return 0;
  }
  if (command === "layout") {
    const result = arrange(state, arrangeOptions(named));
    fs.writeFileSync(named.out || file, toDbml(result.state));
    console.log(`было: ${metricsLine(result.before)}\nстало: ${metricsLine(result.after)}`);
    return 0;
  }
  if (command === "sync") {
    if (!named.columns || !named.fks) fail("sync требует --columns и --fks");
    const { state: synced, changes } = syncSchema(state, parseRows(read(named.columns)), parseRows(read(named.fks)), {
      zone: named.zone,
      keepHidden: named["keep-hidden"],
    });
    let next = synced;
    if (named.layout) {
      const result = arrange(synced, arrangeOptions(named));
      next = result.state;
      console.log(`раскладка: ${metricsLine(result.before)} → ${metricsLine(result.after)}`);
    }
    fs.writeFileSync(named.out || file, toDbml(next));
    console.log(changes.length ? changes.join("\n") : "изменений схемы нет");
    return 0;
  }
  fail(`неизвестная команда ${command}; см. dbml-editor help`);
  return 2;
}

process.exitCode = run(process.argv.slice(2));
