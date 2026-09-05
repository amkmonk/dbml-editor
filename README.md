# Редактор DBML-диаграмм

Чисто фронтовое приложение: открыли `.dbml` или создали новый, поправили на доске, скачали файл. Сервер данных нет.

По умолчанию открывается режим **просмотра**. Редактирование — отдельный режим.

## Запуск в Docker

Из этой папки, без локального Node:

```bash
docker compose up --build
```

Откроется http://localhost:5177.

Образ только раздаёт статику через nginx. Остановить — `Ctrl+C` в том же терминале или `docker compose stop`. Тома не удалять (`down -v` не нужен).

## Запуск без Docker

Если есть Node:

```bash
npm install
npm run dev
```

## Как пользоваться

1. **Открыть** — выбрать `.dbml` с диска. **Новый** или повторное открытие стирают сессию целиком.
2. **Справочник** слева: зоны, таблицы и поля со своими иконками (у PK — ключ, у типов полей — отдельные значки). Таблицы по умолчанию свёрнуты, стрелка раскрывает список полей.
3. В просмотре белая доска и тёмная шапка; в редакторе — светлый серо-индиго.
4. В просмотре из файлов только **Открыть**. Колонки свойств нет. Колесо масштабирует от центра окна, полотно можно тащить куда угодно, полос прокрутки нет. Клик в справочнике центрирует объект. Наведение на таблицу подсвечивает связи; если есть заметка, она появится через секунду. Галочки скрывают столбцы с флагом «Скрывать в просмотре», межзонные связи и линии FK.
5. В редакторе есть Новый, Скачать, Отменить и Повторить, справа — свойства. **Копировать** и **Удалить** стоят там же. Без Shift перетаскивание двигает полотно. Зоны, таблицы и поля тащатся только с зажатым Shift. Стрелки сдвигают выбранный объект, Shift — крупнее. Выбранное поле двигается вверх и вниз стрелками, кнопками в свойствах или Shift-перетаскиванием в таблице. Копирование берёт дочерние: зона → таблицы → внутренние связи.
6. **Отменить / Повторить** (Ctrl+Z / Ctrl+Y) ходят по истории правок. Последний файл и история лежат в `localStorage` браузера: закрытие вкладки их не теряет.
7. **Связь** — кружок слева или справа у поля. Стороны линии в стандартном DBML нет, они пишутся в `// layout ref ...`.
8. **Скачать** — меню: DBML, SQL или PNG. DBML — рабочий файл, позиции и цвета в `// layout ...`. SQL — `CREATE TABLE` и внешние ключи. PNG — картинка схемы. Точка у имени файла пропадает только после скачивания DBML.

## Какой DBML открывается

Редактор читает подмножество DBML. Скопируйте любой пример ниже в файл `.dbml` и откройте через **Открыть**. Без блоков `// layout zone ...` таблицы расставляются автоматически.

Читаются:

- `Table` и поля вида `имя тип` с флагами `[pk]`, `[unique]`, `[hidden]`
- однострочная `Note: 'текст'` у таблицы
- `TableGroup` — это зона на доске
- `Ref:` между полями, опционально `[delete: restrict|cascade|set null|...]`
- цвет шапки `headercolor: #rrggbb`
- комментарии раскладки `// layout ...` (старое имя `// mes2-layout` тоже читается)

Пропускаются: блоки `Project` и `Enum`, секции `indexes { ... }`, многострочные `Note: ''' ... '''`.

При сохранении редактор пишет свой формат: `headercolor`, `TableGroup`, `Ref: a.x > b.y [delete: ...]`, затем `// layout ...`. Имена с пробелами в `Table` / `TableGroup` / `Ref` берутся в кавычки; в раскладке пробел кодируется как `␣`.

### Минимальный файл

Таблицы без `TableGroup` попадут в зону «Схема».

```dbml
Table users {
  id uuid [pk]
  email text [unique]
  password text [hidden]
  Note: 'Учётные записи'
}

Table posts {
  id uuid [pk]
  user_id uuid
  title text
}

Ref: posts.user_id > users.id [delete: restrict]
```

### Зоны, цвет и раскладка

`TableGroup` задаёт зону. `headercolor` на любой таблице группы задаёт цвет зоны, если в раскладке цвета ещё нет. Строки `// layout` фиксируют позиции, размер зоны и стороны связей (`left`, `right`, `auto`).

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
  published_at timestamptz
}

Table "User Profile" {
  user_id uuid [pk]
  display_name text
}

TableGroup "Полномочия" {
  users
  posts
  "User Profile"
}

Ref: posts.user_id > users.id [delete: restrict]
Ref: "User Profile".user_id > users.id [delete: cascade]

// layout zone Полномочия 20 20 640 280 #6d4caf
// layout table users Полномочия 16 16
// layout table posts Полномочия 240 16
// layout table User␣Profile Полномочия 464 16
// layout ref posts user_id users id left right
// layout ref User␣Profile user_id users id auto auto
```

### Две зоны и межзонная связь

```dbml
Table users [headercolor: #6d4caf] {
  id uuid [pk]
  email text [unique]
}

Table orders [headercolor: #c62828] {
  id uuid [pk]
  user_id uuid
  total numeric(12,2)
}

TableGroup auth {
  users
}

TableGroup sales {
  orders
}

Ref: orders.user_id > users.id [delete: set null]

// layout zone auth 20 20 280 180 #6d4caf
// layout zone sales 340 20 280 180 #c62828
// layout table users auth 16 16
// layout table orders sales 16 16
// layout ref orders user_id users id left right
```

### Что писать в раскладке

```
// layout zone <id> <x> <y> <w> <h> <#цвет>
// layout table <id> <зона> <x> <y>
// layout ref <from> <fromCol> <to> <toCol> <left|right|auto> <left|right|auto>
```

Координаты таблицы считаются внутри зоны. Цвет — `#rgb`, `#rrggbb` или старое имя темы (`auth`, `catalog`, `routes`, `exec`, `fact`). Типы полей свободные: иконка в справочнике узнаёт `uuid`, `text`/`varchar`, `int`/`bigint`, `numeric`, `boolean`, `date`, `timestamptz`, `json`/`jsonb`, `bytea`.
