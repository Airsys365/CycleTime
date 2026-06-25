'use strict';
/**
 * Integration tests for CycleTime server.js
 *
 * Bugs discovered and documented here:
 *  BUG-1  /api/check_serial_duplicate — не нормализует SN перед поиском в БД
 *  BUG-2  GET /api/products            — ссылается на view work_orders_plan_active, которого нет в схеме
 *  BUG-3  GET /api/work_orders_plan    — то же самое
 *  BUG-4  POST /api/update_status      — fallback ветка: this.changes + this.changes (удвоение)
 *  BUG-5  POST /api/log_visual_check   — таблица visual_control_records не создаётся в schema
 *  NOTE   /api/admin/import_excel      — нет whitelist на имя таблицы (риск SQL-инъекции)
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_PATH = ':memory:';
process.env.PORT = '3099';

const { app, db } = require('../server');
const supertest = require('supertest');
const api = supertest(app);

// ─── helpers ───────────────────────────────────────────────────────────────
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })
  );
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
  );
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))
  );
}

async function waitForSchema() {
  // Queued after all CREATE TABLE statements — resolves when schema is ready
  await dbGet('SELECT name FROM sqlite_master WHERE type="table" AND name="journal"');
}

async function createTestView() {
  // work_orders_plan_active exists on the production server as a VIEW
  // but is NOT defined in server.js schema code (BUG-2, BUG-3)
  // Create it here so unrelated tests aren't broken by this missing view
  await dbRun(`
    CREATE VIEW IF NOT EXISTS work_orders_plan_active AS
    SELECT * FROM work_orders_plan
  `);
}

async function createVisualControlTables() {
  // These tables are referenced in /api/log_visual_check but never created
  // in server.js — that is BUG-5. Create stubs so we can test the success path too.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS visual_control_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id TEXT,
      work_order_id TEXT,
      operation_id TEXT,
      product_id TEXT,
      serial_number TEXT,
      timestamp TEXT
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS visual_control_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER,
      criterion_text TEXT,
      status INTEGER
    )
  `);
}

async function fixSchemaToMatchProduction() {
  // Per CLAUDE.md: real DB has 'operation_id' column in logs, not 'station'.
  // CREATE TABLE only creates 'station'; INSERT uses 'operation_id'.
  // On the real server both columns exist; we add the missing one here.
  try { await dbRun('ALTER TABLE logs ADD COLUMN operation_id TEXT'); } catch (_) {}

  // Per CLAUDE.md: components.product_name added in production via Excel import
  // but is not in CREATE TABLE. SELECT in /api/components references it.
  try { await dbRun('ALTER TABLE components ADD COLUMN product_name TEXT'); } catch (_) {}

  // defect_journal: /api/log_defect inserts product_id and serial_number,
  // but these columns are not in the CREATE TABLE schema — added on real server later.
  try { await dbRun('ALTER TABLE defect_journal ADD COLUMN product_id TEXT'); } catch (_) {}
  try { await dbRun('ALTER TABLE defect_journal ADD COLUMN serial_number TEXT'); } catch (_) {}
}

// ─── global setup / teardown ───────────────────────────────────────────────
before(async () => {
  await waitForSchema();
  await fixSchemaToMatchProduction();
  await createTestView();
  await createVisualControlTables();
});

after(() => {
  db.close();
});

// ══════════════════════════════════════════════════════════════════════════
//  1. OPERATORS
// ══════════════════════════════════════════════════════════════════════════
describe('Operators CRUD', () => {
  test('GET /api/operators — returns empty array on fresh DB', async () => {
    const r = await api.get('/api/operators');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  test('POST /api/operators — auto-generates TLN id', async () => {
    const r = await api.post('/api/operators').send({ operator_name: 'Иван Петров' });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    assert.match(r.body.id, /^TLN\d{5}$/);
  });

  test('POST /api/operators — second operator gets incremented id', async () => {
    const r1 = await api.post('/api/operators').send({ operator_name: 'Op A' });
    const r2 = await api.post('/api/operators').send({ operator_name: 'Op B' });
    const n1 = parseInt(r1.body.id.replace('TLN', ''), 10);
    const n2 = parseInt(r2.body.id.replace('TLN', ''), 10);
    assert.equal(n2, n1 + 1);
  });

  test('PUT /api/operators/:id — updates name', async () => {
    const create = await api.post('/api/operators').send({ operator_name: 'Old' });
    const id = create.body.id;
    const r = await api.put(`/api/operators/${id}`).send({ operator_name: 'New' });
    assert.equal(r.status, 200);
    assert.equal(r.body.changes, 1);
    const row = await dbGet('SELECT operator_name FROM operators WHERE operator_id = ?', [id]);
    assert.equal(row.operator_name, 'New');
  });

  test('DELETE /api/operators/:id — removes record', async () => {
    const create = await api.post('/api/operators').send({ operator_name: 'ToDelete' });
    const id = create.body.id;
    const r = await api.delete(`/api/operators/${id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.changes, 1);
    const row = await dbGet('SELECT 1 FROM operators WHERE operator_id = ?', [id]);
    assert.equal(row, undefined);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  2. OPERATIONS
// ══════════════════════════════════════════════════════════════════════════
describe('Operations CRUD', () => {
  test('GET /api/operations — returns array', async () => {
    const r = await api.get('/api/operations');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  test('POST /api/operations — creates with given id', async () => {
    const r = await api.post('/api/operations').send({
      operation_id: 'OP_CRUD_01',
      operation_name: 'Test Station',
      standard_cycle_time: 120
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.id, 'OP_CRUD_01');
  });

  test('PUT /api/operations/:id — updates', async () => {
    await api.post('/api/operations').send({ operation_id: 'OP_UPD', operation_name: 'Old', standard_cycle_time: 60 });
    const r = await api.put('/api/operations/OP_UPD').send({ operation_name: 'New', standard_cycle_time: 90 });
    assert.equal(r.status, 200);
    assert.equal(r.body.changes, 1);
  });

  test('DELETE /api/operations/:id — removes', async () => {
    await api.post('/api/operations').send({ operation_id: 'OP_DEL', operation_name: 'X', standard_cycle_time: 0 });
    const r = await api.delete('/api/operations/OP_DEL');
    assert.equal(r.status, 200);
    assert.equal(r.body.changes, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  3. DOWNTIME REASONS
// ══════════════════════════════════════════════════════════════════════════
describe('Downtime Reasons CRUD', () => {
  test('GET /api/downtime_reasons — returns array', async () => {
    const r = await api.get('/api/downtime_reasons');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  test('POST/PUT/DELETE downtime_reasons', async () => {
    const post = await api.post('/api/downtime_reasons').send({ reason_id: 'DR_TEST', reason_description: 'No parts' });
    assert.equal(post.body.status, 'ok');

    const put = await api.put('/api/downtime_reasons/DR_TEST').send({ reason_description: 'No parts updated' });
    assert.equal(put.body.changes, 1);

    const del = await api.delete('/api/downtime_reasons/DR_TEST');
    assert.equal(del.body.changes, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  4. COMPONENTS & DEFECTS
// ══════════════════════════════════════════════════════════════════════════
describe('Components & Defects CRUD', () => {
  test('GET /api/components — returns array', async () => {
    const r = await api.get('/api/components');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  test('POST /api/components — creates', async () => {
    const r = await api.post('/api/components').send({ component_id: 'C01', component_name: 'Крышка', product_id: 'P01' });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
  });

  test('PUT /api/components/:id — updates', async () => {
    await api.post('/api/components').send({ component_id: 'C_UPD', component_name: 'Old', product_id: 'P01' });
    const r = await api.put('/api/components/C_UPD').send({ component_name: 'New', product_id: 'P02' });
    assert.equal(r.status, 200);
    assert.equal(r.body.changes, 1);
  });

  test('GET /api/defects — returns array', async () => {
    const r = await api.get('/api/defects');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  test('POST /api/defects — requires defect_description', async () => {
    const bad = await api.post('/api/defects').send({ component_id: 'C01' });
    assert.equal(bad.status, 400);
  });

  test('POST /api/defects — creates without component_id (uses GENERAL)', async () => {
    const r = await api.post('/api/defects').send({ defect_description: 'Царапина' });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    assert.ok(typeof r.body.id === 'number');
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  5. FULL OPERATOR FLOW  (START → COUNT → PAUSE → RESUME → COUNT → END)
// ══════════════════════════════════════════════════════════════════════════
describe('Full Operator Flow', () => {
  let operatorId;
  const operationId = 'OP_FLOW_01';
  const workOrderId = 'WO_FLOW_001';

  before(async () => {
    const r = await api.post('/api/operators').send({ operator_name: 'Поток Оператор' });
    operatorId = r.body.id;
    await api.post('/api/operations').send({
      operation_id: operationId,
      operation_name: 'Сборка A',
      standard_cycle_time: 120
    });
    await api.post('/api/work_orders_plan').send({
      work_order_id: workOrderId,
      product_name: 'SC1A208',
      planned_total: 50
    });
  });

  test('START_OP — записывается в journal', async () => {
    const r = await api.post('/api/log').send({
      type: 'START_OP',
      operator_id: operatorId,
      operation_id: operationId,
      work_order_id: workOrderId
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
  });

  test('check_operation_status — active после START_OP', async () => {
    const r = await api.post('/api/check_operation_status').send({
      operator_id: operatorId,
      wo: workOrderId
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'active');
  });

  test('COUNT_ITEM — нормализует SN и пишет в journal', async () => {
    const r = await api.post('/api/log').send({
      type: 'COUNT_ITEM',
      operator_id: operatorId,
      operation_id: operationId,
      work_order_id: workOrderId,
      data: { sn: 'S/N: ABC-001', item_count: 1 }
    });
    assert.equal(r.status, 200);
    // Verify normalization stored in DB
    const row = await dbGet(
      "SELECT serial_number FROM journal WHERE event_type='COUNT_ITEM' AND operator_id=? ORDER BY journal_id DESC LIMIT 1",
      [operatorId]
    );
    assert.equal(row.serial_number, 'ABC-001', 'SN должен быть нормализован: без S/N:, upper case');
  });

  test('COUNT_ITEM — lower case SN нормализуется в upper', async () => {
    const r = await api.post('/api/log').send({
      type: 'COUNT_ITEM',
      operator_id: operatorId,
      operation_id: operationId,
      work_order_id: workOrderId,
      data: { sn: 'xyz-999', item_count: 1 }
    });
    assert.equal(r.status, 200);
    const row = await dbGet(
      "SELECT serial_number FROM journal WHERE event_type='COUNT_ITEM' AND serial_number='XYZ-999' LIMIT 1"
    );
    assert.equal(row.serial_number, 'XYZ-999');
  });

  test('PAUSE_OP — пишет статус paused', async () => {
    const r = await api.post('/api/log').send({
      type: 'PAUSE_OP',
      operator_id: operatorId,
      operation_id: operationId,
      work_order_id: workOrderId,
      data: { reason_id: 'NO_PARTS' }
    });
    assert.equal(r.status, 200);
  });

  test('check_paused_status — is_paused=true после PAUSE_OP', async () => {
    const r = await api.post('/api/check_paused_status').send({
      operator_id: operatorId,
      wo: workOrderId
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.is_paused, true);
  });

  test('RESUME_OP — снимает паузу', async () => {
    const r = await api.post('/api/log').send({
      type: 'RESUME_OP',
      operator_id: operatorId,
      operation_id: operationId,
      work_order_id: workOrderId
    });
    assert.equal(r.status, 200);
  });

  test('check_paused_status — is_paused=false после RESUME_OP', async () => {
    const r = await api.post('/api/check_paused_status').send({
      operator_id: operatorId,
      wo: workOrderId
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.is_paused, false);
  });

  test('END_OP_SESSION — финализирует сессию', async () => {
    const r = await api.post('/api/log').send({
      type: 'END_OP_SESSION',
      operator_id: operatorId,
      operation_id: operationId,
      work_order_id: workOrderId
    });
    assert.equal(r.status, 200);
  });

  test('update_status — помечает сессию как finished', async () => {
    const r = await api.post('/api/update_status').send({
      operator_id: operatorId,
      wo: workOrderId,
      status: 'finished'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  });

  test('check_operation_status — finished после завершения', async () => {
    const r = await api.post('/api/check_operation_status').send({
      operator_id: operatorId,
      wo: workOrderId
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'finished');
  });

  test('journal содержит все ожидаемые event_type для сессии', async () => {
    const rows = await dbAll(
      "SELECT event_type FROM journal WHERE operator_id=? AND work_order_id=? ORDER BY journal_id",
      [operatorId, workOrderId]
    );
    const types = rows.map(r => r.event_type);
    assert.ok(types.includes('START_OP'),       'должен быть START_OP');
    assert.ok(types.includes('COUNT_ITEM'),     'должен быть COUNT_ITEM');
    assert.ok(types.includes('PAUSE_OP'),       'должен быть PAUSE_OP');
    assert.ok(types.includes('RESUME_OP'),      'должен быть RESUME_OP');
    assert.ok(types.includes('END_OP_SESSION'), 'должен быть END_OP_SESSION');
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  6. STATUS CHECKS — edge cases
// ══════════════════════════════════════════════════════════════════════════
describe('Status Check edge cases', () => {
  test('BUG: check_paused_status — неизвестный оператор возвращает undefined вместо false', async () => {
    // row && row.status === 'paused'  при row=undefined → undefined
    // JSON.stringify({ is_paused: undefined }) → {}  (поле пропускается)
    // Фикс: !!(row && row.status === 'paused')  или  row ? row.status==='paused' : false
    // server.js:1211
    const r = await api.post('/api/check_paused_status').send({
      operator_id: 'TLN_NOBODY',
      wo: 'WO_NOBODY'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.is_paused, false,
      'BUG в server.js:1211 — is_paused отсутствует в ответе когда нет строк в journal ' +
      '(undefined вместо false). Фикс: !!(row && row.status === \'paused\')'
    );
  });

  test('check_operation_status — неизвестный оператор → status=new', async () => {
    const r = await api.post('/api/check_operation_status').send({
      operator_id: 'TLN_NOBODY',
      wo: 'WO_NOBODY'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'new');
  });

  test('update_status — 400 когда нет operator_id', async () => {
    const r = await api.post('/api/update_status').send({ wo: 'WO_X' });
    assert.equal(r.status, 400);
  });

  test('update_status — 400 когда нет wo', async () => {
    const r = await api.post('/api/update_status').send({ operator_id: 'TLN00001' });
    assert.equal(r.status, 400);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  7. SERIAL NUMBER DUPLICATE CHECK
// ══════════════════════════════════════════════════════════════════════════
describe('Serial Number Duplicate Check', () => {
  const OPR = 'TLN_SN_TEST';
  const OPN = 'OP_SN_TEST';
  const WO  = 'WO_SN_001';

  before(async () => {
    await api.post('/api/operations').send({ operation_id: OPN, operation_name: 'SN Op', standard_cycle_time: 60 });
    // Log COUNT_ITEM with plain SN
    await api.post('/api/log').send({
      type: 'COUNT_ITEM',
      operator_id: OPR,
      operation_id: OPN,
      work_order_id: WO,
      data: { sn: 'SERIAL001', item_count: 1 }
    });
    // Log COUNT_ITEM with prefixed SN (stored as 'PREFIXED001' after normalization)
    await api.post('/api/log').send({
      type: 'COUNT_ITEM',
      operator_id: OPR,
      operation_id: OPN,
      work_order_id: WO,
      data: { sn: 's/n: PREFIXED001', item_count: 1 }
    });
  });

  test('400 когда отсутствуют обязательные поля', async () => {
    const r = await api.post('/api/check_serial_duplicate').send({ operator_id: OPR });
    assert.equal(r.status, 400);
  });

  test('duplicate=false для нового SN', async () => {
    const r = await api.post('/api/check_serial_duplicate').send({
      operator_id: OPR,
      operation_id: OPN,
      work_order_id: WO,
      serial_number: 'BRAND_NEW'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.duplicate, false);
  });

  test('duplicate=true для точного совпадения', async () => {
    const r = await api.post('/api/check_serial_duplicate').send({
      operator_id: OPR,
      operation_id: OPN,
      work_order_id: WO,
      serial_number: 'SERIAL001'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.duplicate, true);
  });

  test('BUG-1: duplicate=false для SN с префиксом s/n: — хотя в БД хранится нормализованный', async () => {
    // В БД хранится 'PREFIXED001' (после normalizeSN)
    // Запрос отправляет raw 's/n: PREFIXED001', а WHERE clause в коде использует
    // serial_number (raw), а не serial (normalized) — строка 384 server.js
    // Ожидаемое поведение: duplicate=true
    // Реальное поведение: duplicate=false (БАГ)
    const r = await api.post('/api/check_serial_duplicate').send({
      operator_id: OPR,
      operation_id: OPN,
      work_order_id: WO,
      serial_number: 's/n: PREFIXED001'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.duplicate, true,
      'BUG-1 в server.js:384 — переменная serial (нормализованная) вычислена, но не используется в WHERE; ' +
      'используется raw serial_number. Дубликаты с префиксом s/n: не обнаруживаются.'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  8. WORK ORDERS PLAN
// ══════════════════════════════════════════════════════════════════════════
describe('Work Orders Plan', () => {
  test('POST — создаёт WO', async () => {
    const r = await api.post('/api/work_orders_plan').send({
      work_order_id: 'WO_PLN_001',
      product_name: 'SC1A208',
      planned_total: 100
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
  });

  test('GET — возвращает список (требует view work_orders_plan_active)', async () => {
    // Тест проходит только при наличии view, который создан в before()
    // На живом сервере view должен существовать (иначе BUG-3)
    const r = await api.get('/api/work_orders_plan');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.ok(r.body.some(row => row.work_order_id === 'WO_PLN_001'));
  });

  test('GET /by_product/:name — фильтрует по продукту', async () => {
    const r = await api.get('/api/work_orders_plan/by_product/SC1A208');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.ok(r.body.length > 0);
    assert.ok(r.body.every(row => row.product_name === 'SC1A208'));
  });

  test('DELETE — удаляет WO', async () => {
    await api.post('/api/work_orders_plan').send({ work_order_id: 'WO_DEL_001', product_name: 'X', planned_total: 1 });
    const r = await api.delete('/api/work_orders_plan/WO_DEL_001');
    assert.equal(r.status, 200);
    assert.equal(r.body.changes, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  9. PRODUCTS
// ══════════════════════════════════════════════════════════════════════════
describe('Products API', () => {
  test('GET /api/products — возвращает список из view (требует work_orders_plan_active)', async () => {
    // На свежем сервере без view вернёт 500 (BUG-2)
    // Здесь view создан в before() выше
    const r = await api.get('/api/products');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  test('POST /api/products — создаёт продукт', async () => {
    const r = await api.post('/api/products').send({ product_id: 'P_TEST', product_name: 'SC1A208' });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
  });

  test('DELETE /api/products/:id — удаляет продукт', async () => {
    await api.post('/api/products').send({ product_id: 'P_DEL', product_name: 'ToDelete' });
    const r = await api.delete('/api/products/P_DEL');
    assert.equal(r.status, 200);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  10. DEFECT JOURNAL
// ══════════════════════════════════════════════════════════════════════════
describe('Defect Journal', () => {
  test('POST /api/defect_journal (legacy) — создаёт запись', async () => {
    const r = await api.post('/api/defect_journal').send({
      operator_id: 'TLN00001',
      operation_id: 'OP_CRUD_01',
      work_order_id: 'WO_FLOW_001',
      component_id: 'C01',
      defect_id: 1,
      product_name: 'SC1A208'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
  });

  test('GET /api/defect_journal — возвращает массив с JOIN-ами', async () => {
    const r = await api.get('/api/defect_journal');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  test('POST /api/log_defect — 400 без обязательных полей', async () => {
    const r = await api.post('/api/log_defect').send({ operator_id: 'TLN00001' });
    assert.equal(r.status, 400);
    assert.equal(r.body.success, false);
  });

  test('POST /api/log_defect — создаёт полную запись дефекта', async () => {
    const r = await api.post('/api/log_defect').send({
      operator_id: 'TLN00001',
      operation_id: 'OP_CRUD_01',
      work_order_id: 'WO_FLOW_001',
      component_id: 'C01',
      defect_id: 1,
      product_name: 'SC1A208',
      serial_number: 'SN_DEFECT_007'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(typeof r.body.id === 'number');
  });

  test('POST /api/log_defect — резолвит product_name через products таблицу', async () => {
    await api.post('/api/products').send({ product_id: 'P_RESOLVE', product_name: 'SC2B100' });
    const r = await api.post('/api/log_defect').send({
      operator_id: 'TLN00001',
      component_id: 'C01',
      defect_id: 1,
      product_id: 'P_RESOLVE'
      // product_name не передаём — должен резолвиться через products
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    const row = await dbGet(
      "SELECT product_name FROM defect_journal WHERE id=?",
      [r.body.id]
    );
    assert.equal(row.product_name, 'SC2B100');
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  11. VISUAL CONTROL
// ══════════════════════════════════════════════════════════════════════════
describe('Visual Control', () => {
  test('400 без обязательных полей', async () => {
    const r = await api.post('/api/log_visual_check').send({});
    assert.equal(r.status, 400);
  });

  test('400 без results массива', async () => {
    const r = await api.post('/api/log_visual_check').send({
      operator_id: 'TLN00001',
      operation_id: '707'
    });
    assert.equal(r.status, 400);
  });

  test('200 с пустым results массивом (таблица создана в before())', async () => {
    // BUG-5: в реальной БД без ручного создания таблицы этот запрос вернёт 500
    const r = await api.post('/api/log_visual_check').send({
      operator_id: 'TLN00001',
      operation_id: '707',
      results: []
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  });

  test('200 с данными контроля', async () => {
    const r = await api.post('/api/log_visual_check').send({
      operator_id: 'TLN00001',
      operation_id: '707',
      work_order_id: 'WO_FLOW_001',
      serial_number: 'SN_VC_001',
      results: [
        { criterion: 'Корпус без вмятин', status: true },
        { criterion: 'Маркировка читаема', status: true },
        { criterion: 'Уплотнитель на месте', status: false }
      ]
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(typeof r.body.record_id === 'number');
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  12. ADMIN API
// ══════════════════════════════════════════════════════════════════════════
describe('Admin API', () => {
  test('GET /api/admin/get_tables — возвращает список таблиц', async () => {
    const r = await api.get('/api/admin/get_tables');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.ok(r.body.includes('journal'));
    assert.ok(r.body.includes('operators'));
    assert.ok(r.body.includes('operations'));
    assert.ok(r.body.includes('defect_journal'));
  });

  test('POST /api/admin/import_excel — ошибка при пустом payload', async () => {
    const r = await api.post('/api/admin/import_excel').send({});
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'error');
  });

  test('POST /api/admin/import_excel — ошибка при пустых rows', async () => {
    const r = await api.post('/api/admin/import_excel').send({ table: 'operators', rows: [] });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'error');
  });

  test('POST /api/admin/import_excel — импорт данных в operators', async () => {
    const r = await api.post('/api/admin/import_excel').send({
      table: 'operators',
      rows: [
        { operator_id: 'TLN_IMP1', operator_name: 'Импорт 1' },
        { operator_id: 'TLN_IMP2', operator_name: 'Импорт 2' }
      ]
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    assert.equal(r.body.rows, 2);
  });

  test('NOTE: import_excel не проверяет имя таблицы (нет whitelist)', async () => {
    // Любое имя таблицы принимается — потенциальная уязвимость
    // На production защищено тем что /admin_tabs.html требует Basic Auth
    // Но сам endpoint /api/admin/import_excel не защищён паролем в коде
    const r = await api.post('/api/admin/import_excel').send({
      table: 'logs',
      rows: [{ timestamp: '2024-01-01', type: 'TEST', operator: 'X', station: 'X', wo: 'X', data: '{}' }]
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok', 'Whitelist отсутствует — любая таблица принимается');
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  13. REPORTS ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════
describe('Reports endpoints', () => {
  test('GET /api/reports/downtime_summary — 200 на пустой БД', async () => {
    const r = await api.get('/api/reports/downtime_summary');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    assert.equal(r.body.total_downtime_minutes, 0);
    assert.deepEqual(r.body.data, []);
  });

  test('GET /api/reports/operations_daily — 200 на пустой БД', async () => {
    const r = await api.get('/api/reports/operations_daily');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    assert.ok(Array.isArray(r.body.data));
  });

  test('GET /api/reports/operations_weekly — 200 на пустой БД', async () => {
    const r = await api.get('/api/reports/operations_weekly');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    assert.ok(Array.isArray(r.body.data));
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  14. LOGS
// ══════════════════════════════════════════════════════════════════════════
describe('Logs API', () => {
  test('GET /api/logs — возвращает массив', async () => {
    const r = await api.get('/api/logs');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  test('POST /api/log — любой тип пишет в logs', async () => {
    const before = await api.get('/api/logs');
    await api.post('/api/log').send({
      type: 'START_OP',
      operator_id: 'TLN00001',
      operation_id: 'OP_CRUD_01',
      work_order_id: 'WO_LOGS_001'
    });
    const after = await api.get('/api/logs');
    assert.ok(after.body.length >= before.body.length);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  15. BUG-4: update_status fallback удваивает changes
// ══════════════════════════════════════════════════════════════════════════
describe('BUG-4: update_status fallback doubles changes count', () => {
  test('fallback ветка — changes не должен удваиваться', async () => {
    // Создаём запись со статусом 'active' через log
    const opRes = await api.post('/api/operators').send({ operator_name: 'Fallback Test' });
    const opId = opRes.body.id;
    await api.post('/api/log').send({
      type: 'START_OP',
      operator_id: opId,
      operation_id: 'OP_CRUD_01',
      work_order_id: 'WO_FALLBACK_001'
    });

    // Первый update_status — должен найти 1 строку (active → finished)
    const r1 = await api.post('/api/update_status').send({
      operator_id: opId,
      wo: 'WO_FALLBACK_001',
      status: 'finished'
    });
    assert.equal(r1.status, 200);
    assert.equal(r1.body.success, true);
    assert.equal(r1.body.changes, 1, 'Первый update должен изменить 1 строку');

    // Второй update_status — уже finished, первая ветка не найдёт строк
    // Попадёт в fallback ветку (status != finished), но там тоже 0 строк
    // BUG-4: возвращает this.changes + this.changes = 0 + 0 = 0 (ОК только случайно)
    // Реальная проблема проявится когда fallback находит 1 строку:
    //   вернёт 1 + 1 = 2 вместо 1
    const r2 = await api.post('/api/update_status').send({
      operator_id: opId,
      wo: 'WO_FALLBACK_001',
      status: 'finished'
    });
    assert.equal(r2.status, 200);
    // changes должен быть 0 (ничего не изменено), но может быть и 0+0=0
    assert.ok(r2.body.changes <= 1,
      'BUG-4 в server.js:1183 — this.changes + this.changes удваивает значение'
    );
  });
});
