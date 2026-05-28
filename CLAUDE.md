# CycleTime — Production Tracker

Система реального времени для учёта производственных операций на заводе.
Операторы работают с планшетов в цеху, руководители смотрят дашборды на ТВ/ПК.

## Стек

- **Backend:** Node.js + Express, SQLite3, порт 3000
- **Frontend:** Vanilla JS, CSS, без фреймворков
- **Локализация:** RU / EN / ET через `translations.js` и `data-i18n` атрибуты
- **Состояние клиента:** localStorage (`GlobalState` JSON объект)

## Запуск

```bash
node server.js
# → http://localhost:3000
```

Нет `package.json` в репо — зависимости (`express`, `sqlite3`) должны быть установлены в окружении.

## Файловая структура

```
server.js              — Express сервер, схема БД, все API эндпоинты
app.js                 — Основная логика фронтенда (login + главная страница оператора)
state_manager.js       — Работа с GlobalState в localStorage
reports.js             — Модуль отчётов (подключается как Express router)
analytics.js           — Аналитические эндпоинты для дашбордов
translations.js        — Переводы RU/EN/ET
ui_helpers.js          — showToast()
visual_check.js        — Модуль визуального контроля
excel_import.js        — UI для импорта Excel (фронтенд)
db_imports.js          — Бэкенд импорта Excel
dashboard_*.js         — Дашборды (live, downtime, operations, orders, progress)
defects_dashboard.js   — Дашборд дефектов
```

HTML-файлы **не хранятся в репо** (подключаются из `public/` папки на живом сервере).
Папка `modules/` тоже **не в репо** — `cycle_planner` и `shift_summary` существуют только на сервере.

## Схема БД

### Таблицы создаются в `server.js` (`db.serialize`)

| Таблица | Назначение | Ключевые колонки |
|---------|-----------|-----------------|
| `operators` | Операторы | `operator_id` (TLN00001), `operator_name` |
| `operations` | Операции/станции | `operation_id`, `operation_name`, `product_id`, `product_name`, `standard_cycle_time` (сек) |
| `products` | Продукты | `product_id`, `product_name` |
| `downtime_reasons` | Причины простоев | `reason_id`, `reason_description` |
| `components` | Компоненты продукта | `component_id`, `component_name`, `product_id`, `product_name` (добавлен через Excel) |
| `defects` | Типы дефектов | `defect_id`, `component_id`, `defect_description` |
| `journal` | Главный журнал событий | `operator_id`, `operation_id`, `event_type`, `work_order_id`, `serial_number`, `item_count`, `reason_id`, `status`, `is_active`, `start_time`, `end_time` |
| `defect_journal` | Журнал дефектов | `operator_id`, `operation_id`, `work_order_id`, `component_id`, `defect_id`, `product_id`, `serial_number`, `product_name` |
| `work_orders_plan` | Рабочие ордера | `work_order_id` (UNIQUE), `product_name`, `planned_total` |
| `logs` | Технический лог | `timestamp`, `type`, `operator`, `station`, `wo`, `data` |

### VIEW (создан в БД вручную, не в коде)

`work_orders_plan_active` — VIEW над `work_orders_plan`. Используется в `/api/work_orders_plan` (GET) и `/api/products` (GET). На свежей БД нужно создать вручную.

### Таблицы визуального контроля (в коде схемы нет, существуют в реальной БД)

`visual_control_records` и `visual_control_results` — используются в `/api/log_visual_check`. На свежей БД нужно создать вручную.

### Эволюция схемы

Многие колонки добавлялись через `ALTER TABLE` (в конце `db.serialize`), а не через `CREATE TABLE`. Это нормально — при свежей установке они уже есть в CREATE TABLE, при обновлении добавляются через ALTER. Ошибки "duplicate column" ожидаемы и обрабатываются.

Таблицы `defects` и `downtime_reasons` в реальной БД имеют дополнительные колонки (`defect_description_en`, `reason_description_en`, `reason_description_ru`, `reason_description_et` и т.д.) — добавлены через Excel-импорт. В коде CREATE TABLE их нет.

## Основной флоу оператора

```
login.html → выбор продукта → оператора → операции → ввод WO номера
  → сохраняется GlobalState в localStorage
  → переход на index.html

index.html:
  START_OP   → работает → сканирует SN → COUNT_ITEM (каждый скан)
  PAUSE_OP   → выбор причины → простой
  RESUME_OP  → продолжение
  END_OP_SESSION → завершение, /api/update_status → 'finished'
```

## Events (типы событий в journal)

| event_type | Когда |
|-----------|-------|
| `START_OP` | Начало операции |
| `PAUSE_OP` | Пауза с причиной (`reason_id`) |
| `RESUME_OP` | Снятие паузы |
| `COUNT_ITEM` | Сканирование SN детали |
| `END_OP_SESSION` | Завершение работы |

## Состояние фронтенда (GlobalState)

Хранится в `localStorage['GlobalState']` как JSON. Поля:

```js
{
  product: 'SC1A208',          // product_name (не ID!)
  operatorId: 'TLN00010',      // ID из operators
  operatorName: 'Иван Иванов', // для отображения
  operator: 'Иван Иванов',     // дубль для совместимости
  operation_id: '707',
  operation_name: 'Сборка SC1A208',
  wo: 'WO123456',
  isAuthorized: true,
  isWorking: null | true | false  // null=не начато, true=работает, false=пауза
}
```

Функции из `state_manager.js`:
- `getGlobalState()` — читает состояние
- `updateGlobalState()` — обновляет поля оператора/операции из DOM селектов
- `clearGlobalState()` — удаляет из localStorage

**Важно:** `setGlobalState()` — НЕ СУЩЕСТВУЕТ. Вызов этой функции бросает ReferenceError.

## Нормализация SN

Серийные номера нормализуются на клиенте ДО отправки (`normalizeSN` в app.js) и на сервере при сохранении (`normalizeSN` в server.js). Формат: удаляется префикс `S/N:`, пробелы, всё приводится к UPPER CASE. Функции идентичны на обоих уровнях.

## Ключевые API эндпоинты

### Core
- `POST /api/log` — запись события в journal (основной эндпоинт)
- `POST /api/check_serial_duplicate` — проверка SN на дубликат
- `POST /api/update_status` — пометить сессию как finished
- `POST /api/check_paused_status` — проверить статус паузы
- `POST /api/check_operation_status` — текущий статус операции

### Справочники (CRUD)
- `/api/operators`, `/api/operations`, `/api/products`
- `/api/downtime_reasons`, `/api/components`, `/api/defects`
- `/api/work_orders_plan`

### Дефекты
- `POST /api/log_defect` — основной эндпоинт записи дефекта (полный, с product_id, serial_number)
- `POST /api/defect_journal` — старый упрощённый эндпоинт (без product_id, serial_number), остался для совместимости
- `GET /api/defect_journal` — последние 100 дефектов с JOIN'ами

### Отчёты (`/api/reports/`)
- `GET /operator_summary/:id` — сводка оператора за сегодня (из `reports.js`, требует модуль `cycle_planner`)
- `GET /shift_summary/:id?wo=...` — итог смены (требует модуль `shift_summary`)
- `GET /operations_daily` — операции за сегодня
- `GET /operations_weekly` — операции за неделю
- `GET /downtime_summary` — простои за сегодня

### Аналитика (`/api/analytics/`)
- `GET /production_plan` — план vs факт по WO
- `GET /cycle_performance_stats` — цикл-тайм по операциям
- `GET /downtime_stats` — статистика простоев
- `GET /quality_stats` — топ дефектов
- `GET /operator_performance` — топ операторов
- `GET /trace/:sn` — трассировка серийного номера
- `GET /filters/list` — данные для фильтров дашбордов

### Визуальный контроль
- `POST /api/log_visual_check` — сохранение результатов VC (требует таблицы `visual_control_records`, `visual_control_results`)

### Админ
- `GET /api/admin/get_tables` — список таблиц БД
- `POST /api/admin/import_excel` — импорт Excel в таблицу (whitelist: operators, operations, downtime_reasons, components, defects, products, defect_journal, work_orders_plan)

## Авторизация

- Главная страница: без пароля
- `/admin_tabs.html`: Basic Auth, пароль `adminpass777`

## Визуальный контроль

Доступен только для операций `707`, `708`, `709`. Критерии в `visual_check.js` (`VC_CRITERIA`). Кнопка VC показывается/скрывается через `updateVisualControlButton()` в app.js.

## Фильтрация операций и WO

На login.html при выборе продукта:
1. `filterOperationsByProduct()` — фильтрует операции по `product_name` из `window.allOperations`
2. `filterWorkOrdersByProduct()` — фильтрует WO по `product_name` из `window.allWorkOrders`

Продукт хранится в системе как `product_name` (строка типа `SC1A208`), не как `product_id`. Это важно при фильтрации.

## История изменений

### Сессия 2026-05-28 — аудит и исправление багов

**Исправлены:**
- `logs` INSERT: колонка `operation_id` → `station` (все технические логи молча падали)
- Дублированное создание таблицы `logs`
- Неиспользуемая переменная `let logs = []`
- `update_status` fallback: `this.changes + this.changes` → `this.changes`
- SQL injection в `import_excel`: добавлен whitelist таблиц

**Удалён мёртвый код из app.js:**
- Пустые функции `initializeAppState()`, `syncLanguageAcrossPages()`
- Недостижимые функции `loadInitialState()`, `loadProductsForDefects()`
- `confirmSelection()` — вызывала несуществующий `setGlobalState()`, всегда падала с ReferenceError
- Второй DOMContentLoaded handler для `confirm-btn`
- Дублированный `loadOperators()` (вторая копия перезаписывала первую, без guard'а)
- Константы `VALID_WO_PREFIX`, `FINAL_OPERATIONS` (нигде не использовались)
- Дублированный блок логики `logoutBtn` в `updateUI()`

**Ветка:** `claude/vigilant-carson-5H3xX`

## Известные особенности / осторожно

- **Routes после `app.listen()`** — в `server.js` часть маршрутов регистрируется после вызова `app.listen()`. Работает, но технически антипаттерн.
- **`defects` описание** — в реальной БД колонки называются `defect_description_en`/`defect_description_ru`/`defect_description_et`, хотя в `CREATE TABLE` только `defect_description`. Эти колонки добавлены через Excel-импорт.
- **`downtime_reasons`** — аналогично: реальная БД имеет `reason_description_ru/en/et`.
- **`components.product_name`** — колонки нет в CREATE TABLE, добавлена через Excel. `loadComponents()` фильтрует компоненты по этому полю.
- **`product` в состоянии** — везде хранится `product_name` (например `SC1A208`), не `product_id`. При добавлении новой логики учитывать это.
- **Автообновление** — `fetchOperatorSummary()` вызывается каждые 30 сек через `startAutoRefresh()`. Останавливается при `END_OP_SESSION`.
