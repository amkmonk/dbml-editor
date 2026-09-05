# dbml-editor — инструкции для агентов

Если тебя прислали из **другого репозитория** сделать `.dbml` под этот редактор — этого файла достаточно. Skill, MCP и клон редактора не нужны. Не пиши полный DBML dbdiagram.io / `@dbml/cli`: редактор читает только подмножество ниже.

Если правишь сам редактор — см. [README.md](./README.md). Исходник диалекта: `src/dbml.js`.

## Задача

По схеме **текущего** проекта (не этого репозитория) создать или обновить `.dbml`, который откроется в [dbml-editor](https://github.com/amkmonk/dbml-editor).

1. Найди живой источник схемы, не догадывайся:
   - Prisma `schema.prisma`, Drizzle, TypeORM, Sequelize, SQLAlchemy, Django, Laravel, EF
   - миграции (Flyway, Liquibase, Alembic, knex)
   - `CREATE TABLE` / `.sql`
2. Несколько источников — спроси, какой канонический, либо бери ORM-схему, не старые миграции.
3. Уже есть `.dbml` — обнови его: сохрани зоны, цвета, заметки и строки `// layout` для живых таблиц. Второй файл не плоди.
4. Новый файл: `schema.dbml` в корне или `docs/schema.dbml`, если есть `docs/`. Строки `// layout ...` не пиши — редактор расставит сам.
5. Скажи, куда сохранить и что открыть в редакторе: **Открыть** → `.dbml`.

## Диалект

Разрешено:

- `Table` и поля `имя тип` с флагами `[pk]`, `[unique]`, `[hidden]`
- однострочная `Note: 'текст'` у таблицы
- `TableGroup` — зона на доске
- `Ref: a.x > b.y [delete: restrict|cascade|set null|no action|set default]`
- `headercolor: #rrggbb` на таблице (цвет зоны — с первой окрашенной таблицы группы)

Запрещено (парсер пропускает или портит файл):

- блоки `Project` и `Enum`
- `indexes { ... }`
- многострочные `Note: ''' ... '''`
- имена полей не из `[A-Za-z_][A-Za-z0-9_]*`
- составные `Ref`, `Ref:` внутри таблицы, `<>` many-to-many без таблицы-связки

Имена таблиц и групп с пробелами — в кавычках: `Table "User Profile"`.

## Группы и поля

- Зоны по модулю / схеме БД / bounded context. Одна куча — только если таблиц меньше ~8.
- Цвета по кругу: `#6d4caf` `#c4921a` `#546e7a` `#c62828` `#2e7d32` `#1565c0` `#ef6c00`. Ставь `headercolor` на первую таблицу группы.
- Типы как в БД: `uuid`, `text`/`varchar(n)`, `int`/`bigint`, `numeric(p,s)`, `boolean`, `date`, `timestamptz`, `json`/`jsonb`, `bytea`. Enum блоком не описывай — имя типа у поля (`status order_status`).
- `[pk]` на каждой колонке первичного ключа, в том числе составного.
- `[unique]` только на одиночном unique. Составной — фразой в `Note`.
- `[hidden]` для секретов: `password`, `token`, `secret`, `hash`, `api_key`, `private_key`.
- `Note` — зачем таблица. В тексте `'` экранируй как `\'`.
- Join-таблицы включай. Ref: зависимая слева, родитель справа (`orders.user_id > users.id`).
- `onDelete` как в схеме; если неизвестно — `restrict`.

## Раскладка

Новый файл — без `// layout`.

Если обновляешь файл с раскладкой:

```
// layout zone <id> <x> <y> <w> <h> <#цвет>
// layout table <id> <зона> <x> <y>
// layout ref <from> <fromCol> <to> <toCol> <left|right|auto> <left|right|auto>
```

Пробел в id раскладки — `␣`. Координаты новым таблицам не выдумывай: лучше без их `// layout table`. Старые строки живых объектов оставь.

## Шаблон

```dbml
Table users [headercolor: #6d4caf] {
  id uuid [pk]
  email text [unique]
  password text [hidden]
  Note: 'Учётные записи'
}

Table posts {
  id uuid [pk]
  user_id uuid
  title varchar(200)
}

TableGroup auth {
  users
  posts
}

Ref: posts.user_id > users.id [delete: restrict]
```
