const express = require('express');
const app = express();
const PORT = 3000;
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(
  path.join(__dirname, 'database.sqlite')
);
app.use(express.json());
const fs = require('fs');

function basicAuth(requiredPassword) {
    return function (req, res, next) {
        const header = req.headers.authorization || "";
        const token = header.split(" ")[1] || "";
        const decoded = Buffer.from(token, "base64").toString();

        // decoded = "username:password"
        const password = decoded.split(":")[1];

        if (password === requiredPassword) {
            return next();
        }

        res.setHeader("WWW-Authenticate", 'Basic realm="Restricted Area"');
        return res.status(401).send("Authorization required");
    };
}
// Dashboard — без пароля
app.get('/dashboard.html', (req, res) => {
    res.sendFile(__dirname + '/public/dashboard.html');
});

// Admin panel — пароль "adminpass777"
app.get('/admin_tabs.html', basicAuth("adminpass777"), (req, res) => {
    res.sendFile(__dirname + '/public/admin_tabs.html');
});


// --- SQLite база ---



db.serialize(() => {
  // 1. Операторы
  db.run(`
    CREATE TABLE IF NOT EXISTS operators (
      operator_id TEXT PRIMARY KEY,
      operator_name TEXT NOT NULL	  
    )
  `);

  // 2. Операции
  db.run(`
  CREATE TABLE IF NOT EXISTS operations (
    operation_id TEXT PRIMARY KEY,
    operation_name TEXT NOT NULL,
    product_id TEXT,    -- ДОБАВИТЬ ЭТО
    product_name TEXT,  -- ДОБАВИТЬ ЭТО
    standard_cycle_time REAL
  )
`);

  // 3. Причины простоев
  db.run(`
    CREATE TABLE IF NOT EXISTS downtime_reasons (
      reason_id TEXT PRIMARY KEY,
      reason_description TEXT NOT NULL
    )
  `);

  // 4. Журнал продуктивности - ОБНОВЛЕННАЯ ВЕРСИЯ
    db.run(`
		CREATE TABLE IF NOT EXISTS journal (
		  journal_id INTEGER PRIMARY KEY AUTOINCREMENT,
		  timestamp TEXT NOT NULL,
		  operator_id TEXT,
		  operation_id TEXT,
		  event_type TEXT,
		  reason_id TEXT,
		  item_count INTEGER,
		  work_order_id TEXT,
		  status TEXT DEFAULT 'active',
		  is_active INTEGER DEFAULT 1,
		  start_time TEXT,
		  end_time TEXT,
		  serial_number TEXT,
		  FOREIGN KEY(operator_id) REFERENCES operators(operator_id),
		  FOREIGN KEY(operation_id) REFERENCES operations(operation_id),
		  FOREIGN KEY(reason_id) REFERENCES downtime_reasons(reason_id)
		)
	  `);
	  
  
  


  // 5. Компоненты
  db.run(`
    CREATE TABLE IF NOT EXISTS components (
      component_id TEXT PRIMARY KEY,
      component_name TEXT NOT NULL,
	  product_type TEXT,
      FOREIGN KEY(product_type) REFERENCES products(product_id)
    )
  `);

  // 6. Дефекты
  db.run(`
    CREATE TABLE IF NOT EXISTS defects (
      defect_id INTEGER PRIMARY KEY AUTOINCREMENT,
      component_id TEXT NOT NULL,
      defect_description TEXT NOT NULL,
      FOREIGN KEY(component_id) REFERENCES components(component_id)
    )
  `);

  // 7. Журнал дефектов
  db.run(`
    CREATE TABLE IF NOT EXISTS defect_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
	  product_name TEXT,
      operator_id TEXT,
      operation_id TEXT,
      work_order_id TEXT,
      component_id TEXT,
      defect_id INTEGER,
      FOREIGN KEY(operator_id) REFERENCES operators(operator_id),
      FOREIGN KEY(operation_id) REFERENCES operations(operation_id),
      FOREIGN KEY(component_id) REFERENCES components(component_id),
      FOREIGN KEY(defect_id) REFERENCES defects(defect_id)
    )
  `);
  // 8. Продукты
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
	  product_id TEXT PRIMARY KEY,
	  product_name TEXT NOT NULL
    )
  `);	
	console.log('✅ Schema verification complete');
	// === Ensure all new columns exist in journal table ===
	  db.run("ALTER TABLE journal ADD COLUMN status TEXT DEFAULT 'active'", err => {
		if (err && !err.message.includes('duplicate column')) console.log('[Schema] journal status:', err.message);
		else console.log('✅ journal.status column verified');
	  });
	  db.run("ALTER TABLE journal ADD COLUMN is_active INTEGER DEFAULT 1", err => {
		if (err && !err.message.includes('duplicate column')) console.log('[Schema] journal is_active:', err.message);
		else console.log('✅ journal.is_active column verified');
	  });
	  db.run("ALTER TABLE journal ADD COLUMN start_time TEXT", err => {
		if (err && !err.message.includes('duplicate column')) console.log('[Schema] journal start_time:', err.message);
		else console.log('✅ journal.start_time column verified');
	  });
	  db.run("ALTER TABLE journal ADD COLUMN end_time TEXT", err => {
		if (err && !err.message.includes('duplicate column')) console.log('[Schema] journal end_time:', err.message);
		else console.log('✅ journal.end_time column verified');
	  });
	  db.run("ALTER TABLE journal ADD COLUMN serial_number TEXT", err => {
		  if (err && !err.message.includes('duplicate column')) 
			console.log('[Schema] journal.serial_number:', err.message);
		  else 
			console.log('✅ journal.serial_number column verified');
		});
	  db.run("ALTER TABLE components ADD COLUMN product_id TEXT", err => {
	  if (err && !err.message.includes('duplicate column')) 
		console.log('[Schema] components.product_id:', err.message);
	  else 
		console.log('✅ components.product_id column verified');
		});
	  // Безопасное добавление product_id в operations
		db.run("ALTER TABLE operations ADD COLUMN product_id TEXT", err => {
			if (err && !err.message.includes('duplicate column')) 
				console.log('[Schema] operations.product_id error:', err.message);
			else 
				console.log('✅ operations.product_id column verified');
		});

		// Безопасное добавление product_name в operations
		db.run("ALTER TABLE operations ADD COLUMN product_name TEXT", err => {
			if (err && !err.message.includes('duplicate column')) 
				console.log('[Schema] operations.product_name error:', err.message);
			else 
				console.log('✅ operations.product_name column verified');
		});
	});
	// 9. Логи 
	db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT,
      type TEXT,
      operator TEXT,
      station TEXT,
      wo TEXT,
      data TEXT
    )
  `);  
  // 10. План по рабочим ордерам
  db.run(`
    CREATE TABLE IF NOT EXISTS work_orders_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id TEXT NOT NULL UNIQUE,
      product_name TEXT,
      planned_total INTEGER DEFAULT 0
    )
  `);



function normalizeSN(sn) {
    if (!sn) return null;
    // Очистка: удаляем "S/N:", пробелы, приводим к верхнему регистру
    return sn.toString().replace(/S\/N[:\s]*/i, "").trim().toUpperCase();
}

// --- API для логирования событий ---
app.post('/api/log', (req, res) => {

  const entry = {
    timestamp: getLocalTimestamp(),
    type: req.body.type,
    operator: req.body.operator_id,
    operation_id: req.body.operation_id,
    wo: req.body.work_order_id,
    data: req.body.data || {}
  };

  const parsed = entry.data;

  // --- 1) Пишем в лог (технический) ---
  db.run(
    `INSERT INTO logs (timestamp, type, operator, station, wo, data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entry.timestamp,
      entry.type,
      entry.operator,
      entry.operation_id,
      entry.wo,
      JSON.stringify(entry.data)
    ]
  );

  // --- 2) Пишем в JOURNAL — ЧИСТАЯ ЕДИНАЯ ЛОГИКА ---
  switch (entry.type) {

    case 'START_OP':
      db.run(`
        INSERT INTO journal (
          timestamp, operator_id, operation_id, event_type,
          work_order_id, start_time, status, is_active
        ) VALUES (?, ?, ?, 'START_OP', ?, ?, 'active', 1)
      `,
      [
        entry.timestamp,
        entry.operator,
        entry.operation_id,
        entry.wo,
        entry.timestamp
      ]);
      break;


    case 'PAUSE_OP':
      db.run(`
        INSERT INTO journal (
          timestamp, operator_id, operation_id, event_type,
          work_order_id, reason_id, start_time, end_time,
          status, is_active
        ) VALUES (?, ?, ?, 'PAUSE_OP', ?, ?, ?, ?, 'paused', 0)
      `,
      [
        entry.timestamp,
        entry.operator,
        entry.operation_id,
        entry.wo,
        parsed.reason_id,
        entry.timestamp,
        entry.timestamp
      ]);
      break;


    case 'RESUME_OP':
      db.run(`
        INSERT INTO journal (
          timestamp, operator_id, operation_id, event_type,
          work_order_id, start_time, status, is_active
        ) VALUES (?, ?, ?, 'RESUME_OP', ?, ?, 'active', 1)
      `,
      [
        entry.timestamp,
        entry.operator,
        entry.operation_id,
        entry.wo,
        entry.timestamp
      ]);
      break;


    case 'COUNT_ITEM': {
      const rawSerial = parsed.sn || parsed.serial_number || null;
	  const serial = normalizeSN(rawSerial);

      console.log('[COUNT_ITEM] storing:', { operator: entry.operator, operation_id: entry.operation_id, wo: entry.wo, serial });
      db.run(`
        INSERT INTO journal (
          timestamp, operator_id, operation_id, event_type,
          item_count, work_order_id, serial_number
        ) VALUES (?, ?, ?, 'COUNT_ITEM', ?, ?, ?)
      `,
      [
        entry.timestamp,
        entry.operator,
        entry.operation_id,
        parsed.item_count || 1,
        entry.wo,
        serial
      ],
      function(err) {
        if (err) console.error('[COUNT_ITEM] INSERT failed:', err.message, { operator: entry.operator, operation_id: entry.operation_id, wo: entry.wo });
        else console.log('[COUNT_ITEM] INSERT ok, rowid:', this.lastID, 'operator:', entry.operator);
      });
      break;
    }



    case 'END_OP_SESSION':
      db.run(`
        INSERT INTO journal (
          timestamp, operator_id, operation_id, event_type,
          work_order_id, end_time, status, is_active
        ) VALUES (?, ?, ?, 'END_OP_SESSION', ?, ?, 'finished', 0)
      `,
      [
        entry.timestamp,
        entry.operator,
        entry.operation_id,
        entry.wo,
        entry.timestamp
      ]);
      break;
  }

  res.json({ status: 'ok' });
});
// 🔹 Проверка серийного номера на дубликат
app.post('/api/check_serial_duplicate', (req, res) => {
  const { operator_id, operation_id, work_order_id, serial_number } = req.body;
  const serial = normalizeSN(serial_number);

  if (!operator_id || !operation_id || !work_order_id || !serial_number) {
    return res.status(400).json({
      duplicate: false,
      error: 'Missing operator_id, operation_id, work_order_id or serial_number'
    });
  }

  db.get(
    `
      SELECT 1 FROM journal
      WHERE operator_id  = ?
        AND operation_id = ?
        AND work_order_id = ?
        AND event_type = 'COUNT_ITEM'
        AND serial_number = ?
      LIMIT 1
    `,
    [operator_id, operation_id, work_order_id, serial_number],
    (err, row) => {
      if (err) {
        console.error('❌ Error in /api/check_serial_duplicate:', err);
        return res.status(500).json({ duplicate: false, error: err.message });
      }

      res.json({
        duplicate: !!row
      });
    }
  );
});

function getLocalTimestamp() {
  return new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 19);
}


app.get('/api/logs', (req, res) => {
  db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 50`, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Diagnostic: all journal entries for a specific operator
app.get('/api/debug/operator/:id', (req, res) => {
  const opId = req.params.id;
  db.all(
    `SELECT event_type, COUNT(*) as cnt, date(timestamp) as day
     FROM journal WHERE operator_id = ?
     GROUP BY event_type, date(timestamp)
     ORDER BY day DESC, event_type`,
    [opId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      db.all(
        `SELECT journal_id, timestamp, event_type, operation_id, work_order_id, serial_number, item_count, status, is_active
         FROM journal WHERE operator_id = ? ORDER BY journal_id DESC LIMIT 20`,
        [opId],
        (err2, recent) => {
          if (err2) return res.status(500).json({ error: err2.message });
          // Also find which operator_ids have records today (in case records stored under wrong id)
          db.all(
            `SELECT operator_id, COUNT(*) as cnt FROM journal
             WHERE date(timestamp) = date('now')
             GROUP BY operator_id ORDER BY cnt DESC LIMIT 20`,
            [],
            (err3, today) => {
              // Find records with empty/null operator_id (common bug)
              db.all(
                `SELECT journal_id, timestamp, event_type, operation_id, work_order_id, operator_id
                 FROM journal WHERE (operator_id IS NULL OR operator_id = '')
                 ORDER BY journal_id DESC LIMIT 10`,
                [],
                (err4, nullOp) => {
                  res.json({
                    operator_id: opId,
                    summary: rows,
                    recent_rows: recent,
                    todays_operators: today || [],
                    null_operator_rows: nullOp || []
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});




// === ADMIN API: GET SQLITE TABLE LIST ===
app.get("/api/admin/get_tables", (req, res) => {
    db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        [],
        (err, rows) => {
            if (err) {
                console.error("Error reading tables:", err);
                return res.json([]);
            }
            res.json(rows.map(r => r.name));
        }
    );
});
// === ADMIN API: IMPORT EXCEL TO SQLITE ===
app.post("/api/admin/import_excel", (req, res) => {
    const { table, rows } = req.body;

    const ALLOWED_TABLES = [
        'operators', 'operations', 'downtime_reasons', 'components',
        'defects', 'products', 'defect_journal', 'work_orders_plan'
    ];

    if (!table || !rows || !Array.isArray(rows)) {
        return res.json({ status: "error", error: "Invalid payload" });
    }

    if (!ALLOWED_TABLES.includes(table)) {
        return res.json({ status: "error", error: `Table "${table}" is not allowed for import` });
    }

    if (rows.length === 0) {
        return res.json({ status: "error", error: "Empty Excel data" });
    }

    // Список колонок
    const columns = Object.keys(rows[0]);

    if (columns.length === 0) {
        return res.json({ status: "error", error: "No columns in Excel" });
    }

    console.log(`📥 Importing ${rows.length} rows into "${table}"...`);

    // Чистим таблицу
    db.run(`DELETE FROM ${table}`, [], (err) => {
        if (err) {
            console.error("Error clearing table:", err);
            return res.json({ status: "error", error: err.message });
        }

        // Формируем SQL вставки
        const placeholders = columns.map(() => "?").join(",");
        const sql = `INSERT INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`;

        const stmt = db.prepare(sql);

        try {
            db.serialize(() => {
                rows.forEach(row => {
                    const values = columns.map(col => row[col]);
                    stmt.run(values);
                });
            });

            stmt.finalize();

            console.log(`✅ Import completed: ${rows.length} rows → ${table}`);
            res.json({ status: "ok", rows: rows.length });

        } catch (e) {
            console.error("Import error:", e);
            res.json({ status: "error", error: e.message });
        }
    });
});



// ⚠️ Статику подключаем ПОСЛЕ API
app.use(express.static(__dirname + '/public'));
app.get('/api/tables', (req, res) => {
  db.all(`SELECT name FROM sqlite_master WHERE type='table'`, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});




// --- API для операторов ---
// Получить всех операторов
app.get('/api/operators', (req, res) => {
  db.all(`SELECT * FROM operators`, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});



// Добавить оператора с автогенерацией ID TLN00001
app.post('/api/operators', (req, res) => {
  const { operator_name } = req.body;

  db.get(`SELECT operator_id FROM operators ORDER BY operator_id DESC LIMIT 1`, [], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    let newId;
    if (!row) {
      newId = 'TLN00001';
    } else {
      const num = parseInt(row.operator_id.replace('TLN', '')) + 1;
      newId = 'TLN' + String(num).padStart(5, '0');
    }

    db.run(
      `INSERT INTO operators (operator_id, operator_name) VALUES (?, ?)`,
      [newId, operator_name],
      function (err2) {
        if (err2) {
          res.status(500).json({ error: err2.message });
        } else {
          res.json({ status: 'ok', id: newId });
        }
      }
    );
  });
});
// Изменить данные оператора
app.put('/api/operators/:id', (req, res) => {
  const { operator_name } = req.body;
  db.run(
    `UPDATE operators SET operator_name = ? WHERE operator_id = ?`,
    [operator_name, req.params.id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ status: 'ok', changes: this.changes });
      }
    }
  );
});


// Удалить оператора
app.delete('/api/operators/:id', (req, res) => {
  db.run(
    `DELETE FROM operators WHERE operator_id = ?`,
    [req.params.id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ status: 'ok', changes: this.changes });
      }
    }
  );
});
// --- API для операций ---
// Получить все операции (БЕЗ products, только новая модель)
app.get('/api/operations', (req, res) => {
  db.all(`
    SELECT *
    FROM operations
    ORDER BY operation_id
  `, [], (err, rows) => {
    if (err) {
      console.error('Error loading operations:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});


// Добавить операцию
app.post('/api/operations', (req, res) => {
  const { operation_id, operation_name, standard_cycle_time } = req.body;
  db.run(
    `INSERT INTO operations (operation_id, operation_name, standard_cycle_time) VALUES (?, ?, ?)`,
    [operation_id, operation_name, standard_cycle_time],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ status: 'ok', id: operation_id });
      }
    }
  );
});

// Изменить операцию
app.put('/api/operations/:id', (req, res) => {
  const { operation_name, standard_cycle_time } = req.body;
  db.run(
    `UPDATE operations SET operation_name = ?, standard_cycle_time = ? WHERE operation_id = ?`,
    [operation_name, standard_cycle_time, req.params.id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ status: 'ok', changes: this.changes });
      }
    }
  );
});

// Удалить операцию
app.delete('/api/operations/:id', (req, res) => {
  db.run(
    `DELETE FROM operations WHERE operation_id = ?`,
    [req.params.id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ status: 'ok', changes: this.changes });
      }
    }
  );
});
// --- API для причин простоев ---
// Получить все причины
app.get('/api/downtime_reasons', (req, res) => {
  db.all(`SELECT * FROM downtime_reasons`, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Добавить причину
app.post('/api/downtime_reasons', (req, res) => {
  const { reason_id, reason_description } = req.body;
  db.run(
    `INSERT INTO downtime_reasons (reason_id, reason_description) VALUES (?, ?)`,
    [reason_id, reason_description],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ status: 'ok', id: reason_id });
      }
    }
  );
});

// Изменить причину
app.put('/api/downtime_reasons/:id', (req, res) => {
  const { reason_description } = req.body;
  db.run(
    `UPDATE downtime_reasons SET reason_description = ? WHERE reason_id = ?`,
    [reason_description, req.params.id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ status: 'ok', changes: this.changes });
      }
    }
  );
});

// Удалить причину
app.delete('/api/downtime_reasons/:id', (req, res) => {
  db.run(
    `DELETE FROM downtime_reasons WHERE reason_id = ?`,
    [req.params.id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ status: 'ok', changes: this.changes });
      }
    }
  );
});
// --- API для компонентов ---
app.get('/api/components', (req, res) => {
  // Обновленный запрос с правильными полями
  db.all(`
	  SELECT component_id, component_name, product_name
	  FROM components
	  ORDER BY component_id
	`, [], (err, rows) => {
	  if (err) {
		console.error('Error loading components:', err);
		res.status(500).json({ error: err.message });
	  } else {
		console.log('🧪 COMPONENTS FROM DB:', rows.slice(0, 5));
		res.json(rows);
	  }
	});
});

app.post('/api/components', (req, res) => {
  const { component_id, component_name, product_id } = req.body;
  db.run(
    `INSERT INTO components (component_id, component_name, product_id) VALUES (?, ?, ?)`,
     [component_id, component_name, product_id],
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ status: 'ok', id: component_id });
    }
  );
});

app.put('/api/components/:id', (req, res) => {
  const { component_name, product_id } = req.body;
  db.run(
    `UPDATE components SET component_name = ?, product_id = ? WHERE component_id = ?`,
    [component_name, product_id, req.params.id],
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ status: 'ok', changes: this.changes });
    }
  );
});

// Остальные методы остаются без изменений
app.delete('/api/components/:id', (req, res) => {
  db.run(
    `DELETE FROM components WHERE component_id = ?`,
    [req.params.id],
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ status: 'ok', changes: this.changes });
    }
  );
});


app.get('/api/defects/:component_id', (req, res) => {
  db.all(`SELECT * FROM defects WHERE component_id = ?`, [req.params.component_id], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

// В методе POST /api/defects измените проверку:
app.post('/api/defects', (req, res) => {
  const { component_id, defect_description } = req.body;
  
  // 🔥 УБИРАЕМ ПРОВЕРКУ НА component_id
  if (!defect_description) {
    return res.status(400).json({ error: 'Defect description is required' });
  }

  db.run(
    `INSERT INTO defects (component_id, defect_description) VALUES (?, ?)`,
    [component_id || 'GENERAL', defect_description], // используем GENERAL если component_id не указан
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ status: 'ok', id: this.lastID });
    }
  );
});

app.put('/api/defects/:id', (req, res) => {
  const { defect_description } = req.body;
  db.run(
    `UPDATE defects SET defect_description = ? WHERE defect_id = ?`,
    [defect_description, req.params.id],
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ status: 'ok', changes: this.changes });
    }
  );
});

app.delete('/api/defects/:id', (req, res) => {
  db.run(
    `DELETE FROM defects WHERE defect_id = ?`,
    [req.params.id],
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ status: 'ok', changes: this.changes });
    }
  );
});
// Добавить запись в журнал дефектов
app.post('/api/defect_journal', (req, res) => {
  const {
    operator_id,
    operation_id,
    work_order_id,
    component_id,
    defect_id,
    product_name
  } = req.body;

  const timestamp = getLocalTimestamp();

  db.run(
    `INSERT INTO defect_journal (
       timestamp,
       operator_id,
       operation_id,
       work_order_id,
       component_id,
       defect_id,
       product_name
     )
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      timestamp,
      operator_id,
      operation_id,
      work_order_id,
      component_id,
      defect_id,
      product_name
    ],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ status: 'ok', id: this.lastID });
    }
  );
});

// Получить последние записи дефектов
app.get('/api/defect_journal', (req, res) => {
  db.all(
    `SELECT dj.id, dj.timestamp, dj.work_order_id,
            o.operator_name, op.operation_name,
            c.component_name, d.defect_description
     FROM defect_journal dj
     LEFT JOIN operators o ON dj.operator_id = o.operator_id
     LEFT JOIN operations op ON dj.operation_id = op.operation_id
     LEFT JOIN components c ON dj.component_id = c.component_id
     LEFT JOIN defects d ON dj.defect_id = d.defect_id
     ORDER BY dj.id DESC
     LIMIT 100`,
    [],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    }
  );
});
// === API для записи дефектов ===
app.post('/api/log_defect', (req, res) => {
  const { 
    operator_id, 
    operation_id, 
    work_order_id, 
    component_id, 
    defect_id,
    product_id,
    product_name,
    serial_number
  } = req.body;
  
  console.log('🔴 Received defect data:', req.body);
  
  if (!operator_id || !component_id || !defect_id) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields: operator_id, component_id, defect_id' 
    });
  }

  const timestamp = getLocalTimestamp();

  // Если product_name пришёл — используем, иначе ищем через products таблицу
  const insertDefect = (resolvedProductName) => {
    db.run(
      `INSERT INTO defect_journal 
       (timestamp, operator_id, operation_id, work_order_id, component_id, defect_id, product_id, serial_number, product_name) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [timestamp, operator_id, operation_id || 'N/A', work_order_id || 'N/A', component_id, defect_id, product_id || '', serial_number || '', resolvedProductName || ''],
      function (err) {
        if (err) {
          console.error('❌ Error inserting defect:', err);
          res.status(500).json({ success: false, error: err.message });
        } else {
          console.log('✅ Defect logged successfully, ID:', this.lastID, 'product_name:', resolvedProductName);
          res.json({ success: true, id: this.lastID });
        }
      }
    );
  };

  if (product_name) {
    insertDefect(product_name);
  } else if (product_id) {
    // Пробуем найти product_name по product_id
    db.get(`SELECT product_name FROM products WHERE product_id = ?`, [product_id], (err, row) => {
      insertDefect(row ? row.product_name : '');
    });
  } else {
    insertDefect('');
  }
});

// --- API: получить все дефекты ---
app.get('/api/defects', (req, res) => {
  db.all(`SELECT * FROM defects`, [], (err, rows) => {
    if (err) {
      console.error('Error loading defects:', err);
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// === API для визуального контроля ===
app.post('/api/log_visual_check', (req, res) => {
  const {
    operator_id,
    work_order_id,
    operation_id,
    product_id,
    serial_number,
    results
  } = req.body;

  if (!operator_id || !operation_id || !Array.isArray(results)) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields (operator_id, operation_id, results)'
    });
  }

  const timestamp = getLocalTimestamp();

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    const insertHeader = `
      INSERT INTO visual_control_records
        (operator_id, work_order_id, operation_id, product_id, serial_number, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(
      insertHeader,
      [operator_id, work_order_id || null, operation_id, product_id || null, serial_number || null, timestamp],
      function (err) {
        if (err) {
          console.error('VC header insert error:', err);
          db.run('ROLLBACK');
          return res.status(500).json({ success: false, error: err.message });
        }

        const recordId = this.lastID;

        if (!results.length) {
          db.run('COMMIT');
          return res.json({ success: true, record_id: recordId });
        }

        const insertDetail = `
          INSERT INTO visual_control_results
            (record_id, criterion_text, status)
          VALUES (?, ?, ?)
        `;
        const stmt = db.prepare(insertDetail);

        try {
          for (const r of results) {
            stmt.run([
              recordId,
              r.criterion || '',
              r.status ? 1 : 0
            ]);
          }

          stmt.finalize(err2 => {
            if (err2) {
              console.error('VC details insert error:', err2);
              db.run('ROLLBACK');
              return res.status(500).json({ success: false, error: err2.message });
            }

            db.run('COMMIT');
            return res.json({ success: true, record_id: recordId });
          });
        } catch (e) {
          console.error('VC exception:', e);
          stmt.finalize();
          db.run('ROLLBACK');
          return res.status(500).json({ success: false, error: e.message });
        }
      }
    );
  });
});

// === Подключение модуля отчетов ===
const reportsRouter = require('./reports')(db);
app.use('/api/reports', reportsRouter);
const analyticsRouter = require('./analytics')(db); 
app.use('/api/analytics', analyticsRouter);

// === 🆕 API для получения данных о прогрессе (для дашборда) ===
app.get('/api/cycle_planner/slot_stats', async (req, res) => {
  try {
    const { operator_id, operation_id, work_order_id } = req.query;
    
    if (!operator_id || !operation_id) {
      return res.status(400).json({ 
        error: 'Необходимы параметры: operator_id, operation_id' 
      });
    }

    const cyclePlanner = require('./modules/cycle_planner');
    const stats = await cyclePlanner.getSlotStats(
      operator_id, 
      operation_id, 
      work_order_id || ''
    );

    res.json(stats);
  } catch (error) {
    console.error('❌ Ошибка в /api/cycle_planner/slot_stats:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});
db.serialize(() => {
    // Ускоряем поиск по времени, серийникам и операциям
    db.run("CREATE INDEX IF NOT EXISTS idx_journal_ts ON journal(timestamp)");
    db.run("CREATE INDEX IF NOT EXISTS idx_journal_sn ON journal(serial_number)");
    db.run("CREATE INDEX IF NOT EXISTS idx_journal_op_wo ON journal(operation_id, work_order_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_dj_ts ON defect_journal(timestamp)");
    console.log("⚡ Индексы оптимизированы. Скорость поиска увеличена.");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// === Авто-завершение забытых операций в конце смены ===

function autoCloseActiveSessions(label) {
  const endTime = getLocalTimestamp();

  db.all(
    `SELECT DISTINCT operator_id, operation_id, work_order_id
     FROM journal
     WHERE is_active = 1 AND status IN ('active', 'paused')`,
    [],
    (err, rows) => {
      if (err) {
        console.error('[AutoClose] Ошибка запроса активных сессий:', err.message);
        return;
      }
      if (!rows || rows.length === 0) {
        console.log(`[AutoClose] ${label}: нет активных сессий`);
        return;
      }

      console.log(`[AutoClose] ${label}: закрываем ${rows.length} сессий`);

      rows.forEach(row => {
        // Вставляем END_OP_SESSION чтобы cycle-time считался корректно
        db.run(
          `INSERT INTO journal (timestamp, operator_id, operation_id, event_type, work_order_id, end_time, status, is_active)
           VALUES (?, ?, ?, 'END_OP_SESSION', ?, ?, 'finished', 0)`,
          [endTime, row.operator_id, row.operation_id, row.work_order_id, endTime]
        );

        // Закрываем все активные строки этой сессии
        db.run(
          `UPDATE journal SET is_active = 0, status = 'finished', end_time = ?
           WHERE operator_id = ? AND work_order_id = ? AND status IN ('active', 'paused')`,
          [endTime, row.operator_id, row.work_order_id]
        );

        console.log(`[AutoClose] закрыта: ${row.operator_id} / ${row.operation_id} / ${row.work_order_id}`);
      });

      // Записываем в технический лог
      db.run(
        `INSERT INTO logs (timestamp, type, operator, station, wo, data)
         VALUES (?, 'AUTO_CLOSE', 'system', 'system', 'all', ?)`,
        [endTime, JSON.stringify({ label, sessions: rows.length })]
      );
    }
  );
}

let lastAutoCloseKey = null;

setInterval(() => {
  const now = new Date();
  const hh = now.getHours();
  const mm = now.getMinutes();

  const isShiftEnd = (hh === 14 && mm === 30) || (hh === 22 && mm === 30);
  if (!isShiftEnd) return;

  // Защита от двойного срабатывания в одну минуту
  const key = `${now.toDateString()}_${hh}:${mm}`;
  if (lastAutoCloseKey === key) return;
  lastAutoCloseKey = key;

  autoCloseActiveSessions(`shift_end_${hh}:${mm}`);
}, 60 * 1000);

// --- API для продуктов ---
app.get('/api/products', (req, res) => {
  console.log('📦 GET /api/products called');
  
  db.all(
	  `SELECT DISTINCT
		 product_name AS product_id,
		 product_name
	   FROM work_orders_plan_active
	   ORDER BY product_name`,
	  [],
	  (err, rows) => {
    if (err) {
      console.error('❌ Error loading products:', err);
      res.status(500).json({ error: err.message });
    } else {
      console.log('✅ Products loaded from DB:', rows);
      res.json(rows);
    }
  });
});

app.post('/api/products', (req, res) => {
  const { product_id, product_name } = req.body;
  db.run(
    `INSERT OR REPLACE INTO products (product_id, product_name) VALUES (?, ?)`,
    [product_id, product_name],
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ status: 'ok', id: product_id });
    }
  );
});

app.delete('/api/products/:id', (req, res) => {
  db.run(
    `DELETE FROM products WHERE product_id = ?`,
    [req.params.id],
    function (err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ status: 'ok', changes: this.changes });
    }
  );
});


// 🆕 Завершение активной операции (обновление статуса) - ИСПРАВЛЕННАЯ ВЕРСИЯ
app.post('/api/update_status', (req, res) => {
  const { operator_id, wo, status } = req.body;
  if (!operator_id || !wo) {
    return res.status(400).json({ error: 'Missing operator_id or work_order' });
  }

  try {
    const endTime = getLocalTimestamp(); // 🔥 ЛОКАЛЬНОЕ ВРЕМЯ

    db.run(
      `UPDATE journal 
       SET is_active = 0, status = ?, end_time = ?
       WHERE operator_id = ? AND work_order_id = ? 
       AND (status = 'active' OR status = 'paused')`,
      [status || 'finished', endTime, operator_id, wo],
      function (err) {
        if (err) {
          console.error('Ошибка при обновлении статуса:', err);
          return res.status(500).json({ error: 'DB update failed' });
        }
        console.log(`✅ Статус обновлён: ${this.changes} строк изменено`);
        
        if (this.changes === 0) {
          db.run(
            `UPDATE journal 
             SET is_active = 0, status = ?, end_time = ?
             WHERE operator_id = ? AND work_order_id = ? 
             AND status != 'finished'`,
            [status || 'finished', endTime, operator_id, wo],
            function (err2) {
              if (err2) {
                console.error('Ошибка при fallback обновлении:', err2);
              } else {
                console.log(`✅ Fallback обновление: ${this.changes} строк`);
              }
              res.json({ success: true, changes: this.changes });
            }
          );
        } else {
          res.json({ success: true, changes: this.changes });
        }
      }
    );
  } catch (err) {
    console.error('Ошибка при обновлении статуса:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🔹 Проверка статуса паузы для операции
app.post('/api/check_paused_status', (req, res) => {
  const { operator_id, wo } = req.body;
  
  db.get(
    `SELECT status FROM journal 
     WHERE operator_id = ? AND work_order_id = ? 
     ORDER BY journal_id DESC LIMIT 1`,
    [operator_id, wo],
    (err, row) => {
      if (err) {
        console.error('Ошибка проверки статуса:', err);
        res.json({ is_paused: false });
      } else {
        res.json({ 
          is_paused: row && row.status === 'paused' 
        });
      }
    }
  );
});
// 🔹 Проверка статуса операции
app.post('/api/check_operation_status', (req, res) => {
  const { operator_id, wo } = req.body;
  
  db.get(
    `SELECT status FROM journal 
     WHERE operator_id = ? AND work_order_id = ? 
     ORDER BY journal_id DESC LIMIT 1`,
    [operator_id, wo],
    (err, row) => {
      if (err) {
        console.error('Ошибка проверки статуса:', err);
        res.json({ status: 'unknown' });
      } else {
        res.json({ 
          status: row ? row.status : 'new'
        });
      }
    }
  );
});
// === API для планов по ордерам ===

// GET - получить все планы
app.get('/api/work_orders_plan', (req, res) => {
  db.all(
    'SELECT * FROM work_orders_plan_active ORDER BY work_order_id',
    [],
    (err, rows) => {
      if (err) {
        console.error('Error fetching work orders plan:', err);
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    }
  );
});


// POST - добавить/обновить план
app.post('/api/work_orders_plan', (req, res) => {
  const { work_order_id, product_name, planned_total } = req.body;
  
  db.run(
    `INSERT OR REPLACE INTO work_orders_plan (work_order_id, product_name, planned_total) 
     VALUES (?, ?, ?)`,
    [work_order_id, product_name, planned_total],
    function(err) {
      if (err) {
        console.error('Error saving work order plan:', err);
        res.status(500).json({ error: err.message });
      } else {
        res.json({ status: 'ok', work_order_id: work_order_id });
      }
    }
  );
});

// DELETE - удалить план
app.delete('/api/work_orders_plan/:work_order_id', (req, res) => {
  const workOrderId = req.params.work_order_id;
  
  db.run(
    'DELETE FROM work_orders_plan WHERE work_order_id = ?',
    [workOrderId],
    function(err) {
      if (err) {
        console.error('Error deleting work order plan:', err);
        res.status(500).json({ error: err.message });
      } else {
        res.json({ status: 'ok', changes: this.changes });
      }
    }
  );
});
// GET - получить ордера по продукту
app.get('/api/work_orders_plan/by_product/:product_name', (req, res) => {
  const productName = req.params.product_name;
  
  db.all(
    'SELECT * FROM work_orders_plan WHERE product_name = ? ORDER BY work_order_id',
    [productName],
    (err, rows) => {
      if (err) {
        console.error('Error fetching work orders by product:', err);
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    }
  );
});
// === 📊 Статистика простоев (для английских названий в reason_id) ===
app.get('/api/reports/downtime_summary', (req, res) => {
  console.log('📊 [downtime_summary] Запрос получен');
  
  const sql = `
    WITH pauses AS (
      SELECT 
        j_pause.timestamp as pause_start,
        j_resume.timestamp as pause_end,
        (strftime('%s', j_resume.timestamp) - strftime('%s', j_pause.timestamp)) as pause_seconds,
        j_pause.reason_id
      FROM journal j_pause
      LEFT JOIN journal j_resume ON (
        j_resume.operator_id = j_pause.operator_id 
        AND j_resume.operation_id = j_pause.operation_id
        AND j_resume.work_order_id = j_pause.work_order_id
        AND j_resume.event_type = 'RESUME_OP'
        AND j_resume.timestamp > j_pause.timestamp
        AND j_resume.timestamp = (
          SELECT MIN(j2.timestamp) 
          FROM journal j2 
          WHERE j2.operator_id = j_pause.operator_id 
            AND j2.operation_id = j_pause.operation_id
            AND j2.work_order_id = j_pause.work_order_id
            AND j2.event_type = 'RESUME_OP'
            AND j2.timestamp > j_pause.timestamp
        )
      )
      WHERE j_pause.event_type = 'PAUSE_OP'
        AND date(j_pause.timestamp) = date('now')
        AND j_resume.timestamp IS NOT NULL
		 -- ✅ ИСКЛЮЧАЕМ ПЕРЕРЫВЫ
        AND j_pause.reason_id != 'Break'
        AND j_pause.reason_id NOT LIKE '%break%'
        AND j_pause.reason_id NOT LIKE '%coffee%'
        AND j_pause.reason_id NOT LIKE '%lunch%'
        AND j_pause.reason_id NOT LIKE '%meal%'
    )
    SELECT 
      COALESCE(p.reason_id, 'No reason specified') as reason,
      COUNT(*) as pause_count,
      SUM(pause_seconds) as total_seconds
    FROM pauses p
    GROUP BY COALESCE(p.reason_id, 'No reason specified')
    ORDER BY total_seconds DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('[downtime_summary] SQL Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
    
    console.log('[downtime_summary] Raw rows:', rows);

    if (!rows || rows.length === 0) {
      return res.json({
        status: 'ok',
        total_downtime_minutes: 0,
        data: []
      });
    }

    const result = rows.map(row => ({
      reason: row.reason,
      count: row.pause_count,
      seconds: row.total_seconds || 0,
      minutes: Math.round((row.total_seconds || 0) / 60),
      percentage: 0
    }));

    const totalSeconds = result.reduce((sum, item) => sum + item.seconds, 0);
    result.forEach(item => {
      item.percentage = totalSeconds > 0 ? Math.round((item.seconds / totalSeconds) * 100) : 0;
    });

    console.log('[downtime_summary] Processed result:', result);

    res.json({
      status: 'ok',
      total_downtime_seconds: totalSeconds,
      total_downtime_minutes: Math.round(totalSeconds / 60),
      data: result
    });
  });
});

// === 📋 Операции за день (НОВАЯ ВЕРСИЯ) ===
app.get('/api/reports/operations_daily', (req, res) => {
  console.log('📋 [operations_daily] Запрос получен');

  const sql = `
   -- === 📋 Операции за день (CLEAN VERSION) ===
	WITH completed_ops AS (
	  SELECT DISTINCT operation_id, work_order_id
	  FROM journal
	  WHERE event_type = 'END_OP_SESSION'
		AND strftime('%s', timestamp) >= strftime('%s', datetime('now','start of day'))
		AND strftime('%s', timestamp) <  strftime('%s', datetime('now','start of day','+1 day'))
	),

	count_events AS (
	  SELECT
		j.operation_id,
		j.work_order_id,
		j.timestamp
	  FROM journal j
	  WHERE j.event_type = 'COUNT_ITEM'
		AND strftime('%s', j.timestamp) >= strftime('%s', datetime('now','start of day'))
		AND strftime('%s', j.timestamp) <  strftime('%s', datetime('now','start of day','+1 day'))
	),

	timed_events AS (
	  SELECT
		c.operation_id,
		c.work_order_id,
		c.timestamp,
		LAG(c.timestamp) OVER (
		  PARTITION BY c.operation_id, c.work_order_id
		  ORDER BY c.timestamp
		) AS prev_timestamp
	  FROM count_events c
	),

	base AS (
	  SELECT
		te.operation_id,
		te.work_order_id,
		o.operation_name,
		o.product_name,

		-- ⏱ фактический такт (мин/шт)
		ROUND(
		  AVG(
			(JULIANDAY(te.timestamp) - JULIANDAY(te.prev_timestamp)) * 86400
		  ) / 60.0,
		  1
		) AS cycle_minutes,

		-- 📏 плановый цикл (мин/шт)
		o.standard_cycle_time / 60.0 AS planned_cycle_minutes,

		-- 🔢 количество изделий
		COUNT(*) AS total_count

	  FROM timed_events te
	  JOIN completed_ops co
		ON co.operation_id  = te.operation_id
	   AND co.work_order_id = te.work_order_id
	  LEFT JOIN operations o ON te.operation_id = o.operation_id
	  WHERE te.prev_timestamp IS NOT NULL
	  GROUP BY
		te.operation_id,
		te.work_order_id,
		o.operation_name,
		o.product_name
	)


	SELECT
	  operation_id,
	  operation_name,
	  work_order_id,
	  product_name,
	  total_count,
	  cycle_minutes,
	  planned_cycle_minutes,

	  CASE
		WHEN planned_cycle_minutes IS NULL THEN NULL
		WHEN cycle_minutes / planned_cycle_minutes <= 1.0 THEN 'ok'
		WHEN cycle_minutes / planned_cycle_minutes <= 1.2 THEN 'warning'
		ELSE 'bad'
	  END AS cycle_status

	FROM base
	ORDER BY total_count DESC;
 
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('❌ Ошибка в operations_daily:', err.message);
      return res.status(500).json({ status: 'error', error: err.message });
    }

    res.json({
      status: 'ok',
	  version: 'NEW_2025', 
      date: new Date().toISOString().slice(0, 10),
      data: rows
    });
  });
});





// === 📅 Операции за неделю (ТОЛЬКО ЗАВЕРШЁННЫЕ ОПЕРАЦИИ) ===
app.get('/api/reports/operations_weekly', (req, res) => { 
  console.log('📊 [operations_weekly] НОВАЯ ВЕРСИЯ v2');

  const sql = `
  WITH finished_week AS (
    SELECT DISTINCT operation_id, work_order_id
    FROM journal
    WHERE event_type = 'END_OP_SESSION'
      AND timestamp >= datetime('now','-6 days','start of day')
  ),

  counts AS (
    SELECT
      j.operation_id,
      j.work_order_id,
      SUM(COALESCE(j.item_count, 0)) AS total_count
    FROM journal j
    JOIN finished_week f
      ON f.operation_id = j.operation_id
     AND f.work_order_id = j.work_order_id
    WHERE j.event_type = 'COUNT_ITEM'
    GROUP BY j.operation_id, j.work_order_id
  ),

  active_time AS (
    SELECT
      j.operation_id,
      j.work_order_id,
      SUM(
        CASE
          WHEN j.event_type IN ('PAUSE_OP','END_OP_SESSION','FINISH_OP')
            THEN CAST(strftime('%s', j.timestamp) AS INTEGER)
          WHEN j.event_type IN ('START_OP','RESUME_OP')
            THEN -CAST(strftime('%s', j.timestamp) AS INTEGER)
          ELSE 0
        END
      ) AS active_sec
    FROM journal j
    JOIN finished_week f
      ON f.operation_id = j.operation_id
     AND f.work_order_id = j.work_order_id
    GROUP BY j.operation_id, j.work_order_id
  )

  SELECT
    c.operation_id,
    o.operation_name,
    o.product_name,

    SUM(c.total_count) AS total_count,

    ROUND(
      CAST(SUM(a.active_sec) AS REAL) / CAST(SUM(c.total_count) AS REAL) / 60.0,
      2
    ) AS cycle_minutes,

    ROUND(o.standard_cycle_time / 60.0, 2) AS planned_cycle_minutes,

    CASE
      WHEN o.standard_cycle_time IS NULL THEN NULL
      WHEN (CAST(SUM(a.active_sec) AS REAL) / CAST(SUM(c.total_count) AS REAL) / 60.0) <= (o.standard_cycle_time / 60.0) THEN 'ok'
      WHEN (CAST(SUM(a.active_sec) AS REAL) / CAST(SUM(c.total_count) AS REAL) / 60.0) <= (o.standard_cycle_time / 60.0) * 1.2 THEN 'warning'
      ELSE 'bad'
    END AS cycle_status

  FROM counts c
  LEFT JOIN active_time a
    ON a.operation_id = c.operation_id
   AND a.work_order_id = c.work_order_id
  LEFT JOIN operations o
    ON o.operation_id = c.operation_id

  GROUP BY
    c.operation_id,
    o.operation_name,
    o.product_name

  ORDER BY total_count DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('❌ Ошибка в operations_weekly:', err.message);
      return res.status(500).json({ status: 'error', error: err.message });
    }

    // Принудительно маппим поля для совместимости с фронтендом
    const mapped = rows.map(r => ({
      operation_id:         r.operation_id,
      operation_name:       r.operation_name,
      product_name:         r.product_name,
      total_count:          r.total_count,
      cycle_minutes:        r.cycle_minutes        || r.avg_cycle_minutes || 0,
      planned_cycle_minutes: r.planned_cycle_minutes || null,
      cycle_status:         r.cycle_status          || null
    }));

    console.log('📊 [operations_weekly] mapped:', JSON.stringify(mapped));

    res.json({
      status: 'ok',
      data: mapped
    });
  });
});

// === 🔧 Заполнение product_name через products ===
app.get('/api/fix/defect_journal_product_name_v2', (req, res) => {
  db.run(`
    UPDATE defect_journal
    SET product_name = (
      SELECT p.product_name 
      FROM products p 
      WHERE p.product_id = defect_journal.product_id
      LIMIT 1
    )
    WHERE product_name IS NULL
      AND product_id IS NOT NULL
  `, [], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'ok', updated_rows: this.changes });
  });
});
// === 🔍 ДИАГНОСТИКА: прямая проверка product_name ===
app.get('/api/debug/defect_products_final', (req, res) => {
  db.all(`
    SELECT DISTINCT product_name, COUNT(*) as cnt
    FROM defect_journal
    WHERE product_name IS NOT NULL AND product_name != ''
    GROUP BY product_name
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all(`
      SELECT DISTINCT p.product_name
      FROM defect_journal dj
      JOIN products p ON dj.product_id = p.product_id
      WHERE p.product_name IS NOT NULL
      ORDER BY p.product_name
    `, [], (err2, rows2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      
      res.json({
        from_defect_journal_direct: rows,
        from_join_with_products: rows2
      });
    });
  });
});