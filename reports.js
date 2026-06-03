// reports.js
// Модуль отчётности

const express = require("express");
module.exports = (db) => {
    const router = express.Router();
    const cyclePlanner = require('./modules/cycle_planner');
    const path = require('path');
    const shiftSummary = require('./modules/shift_summary');

    // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
    
    async function getTotalActiveSeconds(operationId, workOrderId, operatorId) {
        const sql = `
            SELECT timestamp, event_type 
            FROM journal 
            WHERE operation_id = ? AND work_order_id = ? AND operator_id = ?
            AND event_type IN ('START_OP', 'RESUME_OP', 'PAUSE_OP', 'END_OP_SESSION', 'FINISH_OP')
			AND date(timestamp) = date('now')
            ORDER BY timestamp ASC
        `;
        return new Promise((resolve, reject) => {
            db.all(sql, [operationId, workOrderId, operatorId], (err, rows) => { 
                if (err) {
                    console.error('[getTotalActiveSeconds] SQL Error:', err.message);
                    return resolve(0);
                }

                let total = 0;
                let startTime = null;
                
                for (const row of rows) {
                    const ts = new Date(row.timestamp).getTime();
                    if (row.event_type === 'START_OP' || row.event_type === 'RESUME_OP') {
                        startTime = ts;
                    } else if (row.event_type === 'PAUSE_OP' || row.event_type === 'END_OP_SESSION' || row.event_type === 'FINISH_OP') {
                        if (startTime) {
                            total += (ts - startTime) / 1000;
                            startTime = null;
                        }
                    }
                }

                if (startTime) {
                    total += (new Date().getTime() - startTime) / 1000;
                }

                resolve(Math.round(total));
            });
        });
    }

    async function calculateTotalActiveSecondsForPeriod(operationId, period) {
        return new Promise((resolve) => {
            const periodCondition =
                period === "day"
                    ? "date(timestamp) = date('now')"
                    : "timestamp >= datetime('now','-7 days')";

            db.all(
                `SELECT DISTINCT operator_id, work_order_id
                 FROM journal
                 WHERE operation_id = ?
                   AND ${periodCondition}`,
                [operationId],
                async (err, rows) => {
                    if (err || !rows || rows.length === 0) return resolve(0);

                    let total = 0;
                    for (const r of rows) {
                        const sec = await getTotalActiveSeconds(operationId, r.work_order_id, r.operator_id);
                        total += sec;
                    }
                    resolve(total);
                }
            );
        });
    }

    async function calculateTotalItemsForPeriod(operationId, period) {
        return new Promise((resolve) => {
            const periodCondition =
                period === "day"
                    ? "date(timestamp) = date('now')"
                    : "timestamp >= datetime('now','-7 days')";

            db.all(
                `SELECT COALESCE(item_count,0) AS cnt
                 FROM journal
                 WHERE operation_id = ?
                   AND event_type = 'COUNT_ITEM'
                   AND ${periodCondition}`,
                [operationId],
                (err, rows) => {
                    if (err || !rows) return resolve(0);
                    const total = rows.reduce((s, r) => s + (r.cnt || 0), 0);
                    resolve(total);
                }
            );
        });
    }

    async function calculateTotalActiveSeconds(operatorId, operationId, workOrderId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT timestamp, event_type
                FROM journal
                WHERE operator_id = ?
                  AND operation_id = ?
                  AND work_order_id = ?
                  AND event_type IN ('START_OP', 'RESUME_OP', 'PAUSE_OP', 'END_OP_SESSION', 'FINISH_OP')
				  AND date(timestamp) = date('now')
                ORDER BY timestamp ASC
            `;

            db.all(sql, [operatorId, operationId, workOrderId], (err, rows) => {
                if (err || !rows || rows.length === 0) return resolve(0);

                let totalActive = 0;
                let workStartedAt = null;

                for (const row of rows) {
                    const ts = new Date(row.timestamp).getTime();

                    if (row.event_type === 'START_OP' || row.event_type === 'RESUME_OP') {
                        if (workStartedAt === null) {
                            workStartedAt = ts;
                        }
                    } else if (row.event_type === 'PAUSE_OP' || row.event_type === 'END_OP_SESSION' || row.event_type === 'FINISH_OP') {
                        if (workStartedAt !== null) {
                            totalActive += (ts - workStartedAt) / 1000;
                            workStartedAt = null;
                        }
                    }
                }

                if (workStartedAt !== null) {
                    const now = Date.now();
                    totalActive += (now - workStartedAt) / 1000;
                }

                resolve(Math.round(totalActive));
            });
        });
    }

    async function calculateTotalItems(operatorId, operationId, workOrderId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT SUM(COALESCE(item_count, 0)) AS total
                FROM journal
                WHERE operator_id = ?
				  AND operation_id = ?
				  AND work_order_id = ?
				  AND event_type = 'COUNT_ITEM'
				  AND date(timestamp) = date('now')
            `;
            db.get(sql, [operatorId, operationId, workOrderId], (err, row) => {
                if (err) return reject(err);
                resolve(row?.total || 0);
            });
        });
    }

    // === ЭНДПОИНТЫ ===

    router.get('/daily_summary', async (req, res) => {
        try {
            const ops = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT DISTINCT operation_id
                     FROM journal
                     WHERE event_type = 'COUNT_ITEM'
                       AND date(timestamp) = date('now')`,
                    [],
                    (err, rows) => err ? reject(err) : resolve(rows || [])
                );
            });

            const results = [];

            for (const op of ops) {
                const operationId = op.operation_id;
                const totalActiveSeconds = await calculateTotalActiveSecondsForPeriod(operationId, "day");
                const totalItems = await calculateTotalItemsForPeriod(operationId, "day");
                const avgCycleMin = totalItems > 0 ? (totalActiveSeconds / totalItems) / 60 : 0;

                const meta = await new Promise((resolve, reject) => {
                    db.get(
                        `SELECT operation_name, p.product_name
                         FROM operations o
                         LEFT JOIN products p ON o.product_id = p.product_id
                         WHERE o.operation_id = ?`,
                        [operationId],
                        (err, row) => err ? reject(err) : resolve(row)
                    );
                });

                results.push({
                    operation_id: operationId,
                    operation_name: meta?.operation_name || operationId,
                    product_name: meta?.product_name || "-",
                    total_items: totalItems || 0,
                    avg_cycle_minutes: Number(avgCycleMin.toFixed(2))
                });
            }

            res.json({
                status: "ok",
                endpoint: "daily_summary",
                data: results
            });

        } catch (err) {
            console.error("[daily_summary ERROR]", err);
            res.status(500).json({ status: "error", error: err.message });
        }
    });

    router.get('/weekly_summary', async (req, res) => {
        try {
            const ops = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT DISTINCT operation_id
                     FROM journal
                     WHERE event_type = 'COUNT_ITEM'
                       AND timestamp >= datetime('now','-7 days')`,
                    [],
                    (err, rows) => err ? reject(err) : resolve(rows || [])
                );
            });

            const results = [];

            for (const op of ops) {
                const operationId = op.operation_id;
                const totalActiveSeconds = await calculateTotalActiveSecondsForPeriod(operationId, "week");
                const totalItems = await calculateTotalItemsForPeriod(operationId, "week");
                const avgCycleMin = totalItems > 0 ? (totalActiveSeconds / totalItems) / 60 : 0;

                const meta = await new Promise((resolve, reject) => {
                    db.get(
                        `SELECT operation_name, p.product_name
                         FROM operations o
                         LEFT JOIN products p ON o.product_id = p.product_id
                         WHERE o.operation_id = ?`,
                        [operationId],
                        (err, row) => err ? reject(err) : resolve(row)
                    );
                });

                results.push({
                    operation_id: operationId,
                    operation_name: meta?.operation_name || operationId,
                    product_name: meta?.product_name || "-",
                    total_items: totalItems || 0,
                    avg_cycle_minutes: Number(avgCycleMin.toFixed(2))
                });
            }

            res.json({
                status: "ok",
                endpoint: "weekly_summary",
                data: results
            });

        } catch (err) {
            console.error("[weekly_summary ERROR]", err);
            res.status(500).json({ status: "error", error: err.message });
        }
    });

    // 🔥 ВОССТАНОВЛЕННЫЙ ЭНДПОИНТ: Сводка оператора
    router.get('/operator_summary/:operator_id', async (req, res) => {
        const operatorId = req.params.operator_id;

        const sql = `
            SELECT 
                j.operator_id AS operator_id,
                j.operation_id AS operation_id,
                j.work_order_id AS work_order_id,
                op.operation_name AS operation_name, 
                op.standard_cycle_time AS plan_sec,
                SUM(COALESCE(j.item_count, 0)) AS count,
                MAX(j.timestamp) AS last_activity,

                (SELECT jj.status 
                 FROM journal jj 
                 WHERE jj.operator_id = j.operator_id
                   AND jj.operation_id = j.operation_id
                   AND jj.work_order_id = j.work_order_id
                 ORDER BY jj.timestamp DESC
                 LIMIT 1
                ) AS status,

                CASE 
                    WHEN (SELECT jj.status FROM journal jj 
                          WHERE jj.operator_id = j.operator_id
                            AND jj.operation_id = j.operation_id
                            AND jj.work_order_id = j.work_order_id
                          ORDER BY jj.timestamp DESC LIMIT 1) = 'finished' THEN 0
                    WHEN (SELECT jj.status FROM journal jj 
                          WHERE jj.operator_id = j.operator_id
                            AND jj.operation_id = j.operation_id
                            AND jj.work_order_id = j.work_order_id
                          ORDER BY jj.timestamp DESC LIMIT 1) = 'paused' THEN 0
                    WHEN MAX(j.timestamp) >= datetime('now', '-10 minutes') THEN 1
                    ELSE 0 
                END AS is_active

            FROM journal j
            LEFT JOIN operations op ON j.operation_id = op.operation_id
            WHERE j.operator_id = ?
			  AND j.event_type = 'COUNT_ITEM'
              AND date(j.timestamp) = date('now')
            GROUP BY j.operator_id, j.operation_id, j.work_order_id, op.operation_name, op.standard_cycle_time
            ORDER BY last_activity DESC
        `;

        try {
            const rows = await new Promise((resolve, reject) => {
                db.all(sql, [operatorId], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });

            console.log('[operator_summary] Found rows:', rows.length);

            const enriched = [];

            for (const row of rows) {
                try {
                    const totalActiveSeconds = await calculateTotalActiveSeconds(
                        row.operator_id,
                        row.operation_id,
                        row.work_order_id
                    );

                    const totalItems = await calculateTotalItems(
                        row.operator_id,
                        row.operation_id,
                        row.work_order_id
                    );

                    let cycleMinutes = 0;
                    if (totalItems > 0 && totalActiveSeconds > 0) {
                        cycleMinutes = (totalActiveSeconds / totalItems) / 60;
                    }

                    let plannedCycleMinutes = null;
                    if (row.plan_sec) {
                        plannedCycleMinutes = row.plan_sec / 60;
                    }
					
					let planned_per_hour = null;
					if (plannedCycleMinutes && plannedCycleMinutes > 0) {
						planned_per_hour = Math.ceil(60 / plannedCycleMinutes);
					}

                    enriched.push({
                        ...row,
                        wo: row.work_order_id,
                        cycle_minutes: Number(cycleMinutes.toFixed(2)),
                        active_seconds: totalActiveSeconds,
                        planned_cycle_minutes: plannedCycleMinutes ? Number(plannedCycleMinutes.toFixed(2)) : null,
						planned_per_hour: planned_per_hour,
                        count: totalItems
                    });

                } catch (err) {
                    console.error('[operator_summary] Calc error:', err.message);
                    enriched.push(row);
                }
            }

            console.log("=== FINAL ENRICHED ===", JSON.stringify(enriched, null, 2));

            res.json({
                status: 'ok',
                operator_id: operatorId,
                summary: enriched
            });

        } catch (err) {
            console.error('[operator_summary] Fatal:', err.message);
            res.status(500).json({ status: 'error', error: err.message });
        }
    });
	
	// Получение списка уникальных ордеров оператора за дату
	router.get('/operator_wo_list', (req, res) => {
		const { operator_id, date } = req.query;
		const reportDate = date || new Date().toISOString().slice(0, 10);

		const sql = `
			SELECT DISTINCT work_order_id 
			FROM journal 
			WHERE operator_id = ? AND date(timestamp) = date(?)
			UNION
			SELECT DISTINCT work_order_id 
			FROM defect_journal 
			WHERE operator_id = ? AND date(timestamp) = date(?)
		`;

		db.all(sql, [operator_id, reportDate, operator_id, reportDate], (err, rows) => {
			if (err) return res.status(500).json({ error: err.message });
			res.json({ status: "ok", work_orders: rows.map(r => r.work_order_id).filter(Boolean) });
		});
	});

    // 🔥 ИСПРАВЛЕННЫЙ ЭНДПОИНТ: Live операции
    router.get('/live_from_summary', async (req, res) => {
        try {
            console.log('🔍 [live_from_summary] Начинаем расчёт...');

            const sql = `
                SELECT
                    o.operator_name,
                    j.operator_id,
                    j.operation_id,
                    j.work_order_id,
                    MAX(j.timestamp) AS last_activity,
                    op.operation_name,
                    op.product_name,
                    op.standard_cycle_time AS plan_sec,

                    (SELECT status FROM journal
                     WHERE operator_id = j.operator_id
                       AND operation_id = j.operation_id
                       AND work_order_id = j.work_order_id
                     ORDER BY journal_id DESC LIMIT 1
                    ) AS status
					
					,
					(
						SELECT 
							ROUND( (SUM(CASE WHEN jj.event_type='COUNT_ITEM' THEN 1 END) > 0) *
								   (SUM(CASE 
											WHEN jj.event_type IN ('PAUSE_OP','END_OP_SESSION','FINISH_OP') 
												 AND prevjj.timestamp IS NOT NULL
											THEN (strftime('%s', jj.timestamp) - strftime('%s', prevjj.timestamp))
										END)
								   ) / 
								   NULLIF(SUM(CASE WHEN jj.event_type='COUNT_ITEM' THEN 1 END), 0)
								   / 60.0, 2)
						FROM journal jj
						LEFT JOIN journal prevjj 
							 ON prevjj.journal_id = jj.journal_id - 1
						WHERE jj.operator_id = j.operator_id
						  AND jj.operation_id = j.operation_id
						  AND jj.work_order_id = j.work_order_id
					) AS actual_cycle_minutes


                FROM journal j
				LEFT JOIN operators o ON j.operator_id = o.operator_id
				LEFT JOIN operations op 
					ON TRIM(j.operation_id) = TRIM(op.operation_id)
				WHERE j.event_type = 'COUNT_ITEM'
				GROUP BY j.operator_id, j.work_order_id
                HAVING status IN ('active','paused')
                ORDER BY last_activity DESC
            `;

            const data = await new Promise((resolve, reject) => {
                db.all(sql, (err, rows) => err ? reject(err) : resolve(rows || []));
            });

            console.log(`📊 Найдено активных операций: ${data.length}`);

            const results = [];

            for (const row of data) {
                console.log(`🔄 Обрабатываем: ${row.operator_id} / ${row.operation_id} / ${row.work_order_id}`);

                const slotStats = await cyclePlanner.getSlotStats(
		row.operator_id,
		row.operation_id,
		row.work_order_id,
		new Date()
	);

	console.log(`📈 Статистика:`, slotStats);

	// 🔢 Общее количество посчитанных штук за сегодня
	const totalCount = await new Promise((resolve) => {
		db.get(
			`SELECT SUM(COALESCE(item_count, 0)) AS total
			 FROM journal
			 WHERE operator_id = ?
			   AND operation_id = ?
			   AND work_order_id = ?
			   AND event_type = 'COUNT_ITEM'
			   AND date(timestamp) = date('now')`,
			[row.operator_id, row.operation_id, row.work_order_id],
			(err, countRow) => {
				if (err) return resolve(0);
				resolve(countRow?.total || 0);
			}
		);
	});

	// 🕒 Реальное активное время (как в operator_summary)
	const totalActiveSeconds = await calculateTotalActiveSeconds(
		row.operator_id,
		row.operation_id,
		row.work_order_id
	);

	// ⏱️ Реальный цикл = активное время / количество / 60
	let actualCycleMinutes = 0;
	if (totalActiveSeconds > 0 && totalCount > 0) {
		actualCycleMinutes = (totalActiveSeconds / totalCount) / 60;
	}

	// 📏 Плановый цикл в минутах из plan_sec
	let plannedCycleMinutes = null;
	if (row.plan_sec) {
		plannedCycleMinutes = row.plan_sec / 60;
	}

	results.push({
		operator_name: row.operator_name,
		operator_id: row.operator_id,
		operation_id: row.operation_id,
		operation_name: row.operation_name,
		product_name: row.product_name || null,
		work_order_id: row.work_order_id,
		last_activity: row.last_activity,
		total_count: totalCount,

		// оставляем live-метрики по 10 минутам
		hourly_count: slotStats.count_last_10min || 0,

		// 🔥 ФАКТИЧЕСКИЙ цикл — как в сводке оператора
		actual_cycle: actualCycleMinutes ? Number(actualCycleMinutes.toFixed(2)) : 0,

		// 🔥 ПЛАНОВЫЙ цикл — минуты из standard_cycle_time
		planned_cycle: plannedCycleMinutes ? Number(plannedCycleMinutes.toFixed(2)) : 0,

		// активное время за всю смену
		active_seconds: totalActiveSeconds || 0,

		status: row.status
	});

            }

            console.log('✅ Данные готовы:', results);
            res.json({ data: results });

        } catch (err) {
            console.error('❌ Ошибка в live_from_summary:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/shift_summary/:operator_id', async (req, res) => {
        const operatorId = req.params.operator_id;
        const workOrderId = req.query.wo;

        if (!workOrderId) {
            return res.status(400).json({
                status: 'error',
                error: 'work_order_id (параметр "wo") обязателен',
            });
        }

        try {
            const summary = await shiftSummary.getShiftSummary(operatorId, workOrderId, new Date());

            res.json({
                status: 'ok',
                operator_id: operatorId,
                work_order_id: workOrderId,
                date: new Date().toISOString().slice(0, 10),
                summary,
            });
        } catch (err) {
            console.error('[shift_summary] Fatal error:', err.message);
            res.status(500).json({
                status: 'error',
                error: err.message,
            });
        }
    });
	// === 📊 DEFECTS ANALYTICS (MONTHLY, BY PRODUCT) ===

	
	
	// 1) Список продуктов, у которых есть дефекты за 30 дней
	router.get('/defects/products', (req, res) => {
		const sql = `
			SELECT DISTINCT p.product_name
			FROM defect_journal dj
			LEFT JOIN journal jm ON dj.serial_number = jm.serial_number
			LEFT JOIN work_orders_plan p ON jm.work_order_id = p.work_order_id
			WHERE p.product_name IS NOT NULL
			  AND dj.timestamp >= datetime('now', '-30 days')
			ORDER BY p.product_name;
		`;
		db.all(sql, [], (err, rows) => {
			if (err) {
				console.error('[defects/products] SQL error:', err.message);
				return res.status(500).json({ error: err.message });
			}
			res.json(rows || []);
		});
	});

	// 2) Топ-5 компонентов по продукту за 30 дней
	router.get('/defects/:productName/top_components', (req, res) => {
		const { productName } = req.params;
		const sql = `
			SELECT
				c.component_name,
				COUNT(*) AS defect_count
			FROM defect_journal dj
			LEFT JOIN components c ON dj.component_id = c.component_id
			LEFT JOIN journal jm ON dj.serial_number = jm.serial_number
			LEFT JOIN work_orders_plan p ON jm.work_order_id = p.work_order_id
			WHERE p.product_name = ?
			  AND dj.timestamp >= datetime('now', '-30 days')
			GROUP BY c.component_id, c.component_name
			ORDER BY defect_count DESC
			LIMIT 5;
		`;
		db.all(sql, [productName], (err, rows) => {
			if (err) {
				console.error('[defects/:productName/top_components] SQL error:', err.message);
				return res.status(500).json({ error: err.message });
			}
			res.json(rows || []);
		});
	});

	// 3) Топ-5 дефектов по продукту за 30 дней
	router.get('/defects/:productName/top_defects', (req, res) => {
		const { productName } = req.params;
		const sql = `
			SELECT
				d.defect_description_en AS defect_name,
				COUNT(*) AS defect_count
			FROM defect_journal dj
			JOIN defects d ON dj.defect_id = d.defect_id
			LEFT JOIN journal jm ON dj.serial_number = jm.serial_number
			LEFT JOIN work_orders_plan p ON jm.work_order_id = p.work_order_id
			WHERE p.product_name = ?
			  AND dj.defect_id IS NOT NULL
			  AND dj.timestamp >= datetime('now', '-30 days')
			GROUP BY dj.defect_id, d.defect_description_en
			ORDER BY defect_count DESC
			LIMIT 5;
		`;
		db.all(sql, [productName], (err, rows) => {
			if (err) {
				console.error('[defects/:productName/top_defects] SQL error:', err.message);
				return res.status(500).json({ error: err.message });
			}
			res.json(rows || []);
		});
	});


	
	
	// === 📄 IDEAL DAILY OPERATOR REPORT (START/RESUME → PAUSE/END/FINISH) ===
	router.get('/operator_daily_report', async (req, res) => {
		try {
			const operatorId = req.query.operator_id;
			const date = req.query.date || new Date().toISOString().slice(0, 10);
			// 🔥 ВОТ ЭТОГО НЕ ХВАТАЛО: объявляем переменную из запроса
			const workOrderIdFilter = req.query.work_order_id;

			if (!operatorId) {
				return res.status(400).json({ status: "error", error: "operator_id required" });
			}

			// === 1. Выпуск (COUNT_ITEM) с учетом фильтра WO ===
			const rows = await new Promise((resolve, reject) => {
				let sql = `
					SELECT 
						j.work_order_id,
						j.operation_id,
						o.operation_name,
						SUM(COALESCE(j.item_count, 0)) AS total_count
					FROM journal j
					LEFT JOIN operations o ON j.operation_id = o.operation_id 
					WHERE j.operator_id = ?
					  AND date(j.timestamp) = date(?)
					  AND j.event_type = 'COUNT_ITEM'
				`;
				const params = [operatorId, date];

				// 🔥 Фильтруем выпуск, если ордер выбран
				if (workOrderIdFilter && workOrderIdFilter !== "") {
					sql += ` AND j.work_order_id = ? `;
					params.push(workOrderIdFilter);
				}

				sql += ` GROUP BY j.work_order_id, j.operation_id ORDER BY j.work_order_id`;

				db.all(sql, params, (err, r) => err ? reject(err) : resolve(r || []));
			});

			// === 2. Дефекты с учетом фильтра WO ===
			const defects = await new Promise((resolve, reject) => {
				let sql = `
					SELECT 
						dj.work_order_id,
						dj.operation_id,
						COUNT(*) AS defective_count,
						SUM(CASE WHEN dj.defect_id = 555 THEN 1 ELSE 0 END) AS repair_sent_count,
						GROUP_CONCAT(d.defect_description_ru) AS defects_list
					FROM defect_journal dj
					LEFT JOIN defects d ON dj.defect_id = d.defect_id
					WHERE dj.operator_id = ?
					  AND date(dj.timestamp) = date(?)
				`;
				const params = [operatorId, date];

				// 🔥 Фильтруем дефекты тоже, чтобы данные совпадали
				if (workOrderIdFilter && workOrderIdFilter !== "") {
					sql += ` AND dj.work_order_id = ? `;
					params.push(workOrderIdFilter);
				}

				sql += ` GROUP BY dj.work_order_id, dj.operation_id`;

				db.all(sql, params, (err, r) => err ? reject(err) : resolve(r || []));
			});

			const defectMap = {};
			for (const d of defects) {
				const key = `${d.work_order_id}_${d.operation_id}`;
				defectMap[key] = {
					defective_count: d.defective_count || 0,
					repair_sent_count: d.repair_sent_count || 0,
					defects_list: d.defects_list || "-"
				};
			}

			const report = [];

			// === 3. Сбор событий и расчёт метрик по каждой (WO, Operation) ===
			
			for (const r of rows) {
				const key = `${r.work_order_id}_${r.operation_id}`;
				const def = defectMap[key] || {};

				const events = await new Promise((resolve, reject) => {
					db.all(
						`
						SELECT event_type, timestamp
						FROM journal
						WHERE operator_id = ?
						  AND work_order_id = ?
						  AND operation_id = ?
						  AND date(timestamp) = date(?)
						ORDER BY timestamp ASC
						`,
						[operatorId, r.work_order_id, r.operation_id, date],
						(err, rows) => err ? reject(err) : resolve(rows || [])
					);
				});

				// --- Твой расчет активного времени (без изменений) ---
				let activeSec = 0;
				let activeStart = null;
				let downtimeSec = 0;
				let pauseStart = null;

				for (const e of events) {
					const ts = new Date(e.timestamp).getTime();

					if (e.event_type === 'START_OP' || e.event_type === 'RESUME_OP') {
						if (activeStart === null) activeStart = ts;
						if (pauseStart !== null) {
							downtimeSec += (ts - pauseStart) / 1000;
							pauseStart = null;
						}
					}

					if (e.event_type === 'PAUSE_OP') {
						if (activeStart !== null) {
							activeSec += (ts - activeStart) / 1000;
							activeStart = null;
						}
						pauseStart = ts;
					}

					if (e.event_type === 'END_OP_SESSION' || e.event_type === 'FINISH_OP') {
						if (activeStart !== null) {
							activeSec += (ts - activeStart) / 1000;
							activeStart = null;
						}
						if (pauseStart !== null) {
							downtimeSec += (ts - pauseStart) / 1000;
							pauseStart = null;
						}
					}
				}

				const now = Date.now();
				if (activeStart !== null) activeSec += (now - activeStart) / 1000;
				if (pauseStart !== null) downtimeSec += (now - pauseStart) / 1000;

				const totalCount = r.total_count || 0;
				const cycleSec = totalCount > 0 && activeSec > 0 
					? activeSec / totalCount 
					: 0;

				report.push({
					work_order_id: r.work_order_id,
					operation_id: r.operation_id,
					operation_name: r.operation_name || r.operation_id,
					total_count: totalCount,
					defective_count: def.defective_count || 0,
					repair_sent_count: def.repair_sent_count || 0,
					defects_list: def.defects_list || "-",
					active_time_seconds: Math.round(activeSec),
					downtime_seconds: Math.round(downtimeSec),
					cycle_time_seconds: Math.round(cycleSec)
				});
			}

			return res.json({ status: "ok", report });

		} catch (err) {
			console.error("[operator_daily_report ERROR]", err.message);
			return res.status(500).json({ status: "error", error: err.message });
		}
	});
	// --- 📊 Операции за день (ФИНАЛЬНЫЙ ИСПРАВЛЕННЫЙ) ---
    router.get('/operations_daily', async (req, res) => {
		try {
			// 1. Находим завершённые сегодня операции
			const finished = await new Promise((resolve, reject) => {
				db.all(`
					WITH last_status AS (
						SELECT operation_id, work_order_id, operator_id, status,
							   ROW_NUMBER() OVER (PARTITION BY operation_id, work_order_id, operator_id ORDER BY journal_id DESC) as rn
						FROM journal WHERE date(timestamp) = date('now')
					)
					SELECT operation_id, work_order_id, operator_id
					FROM last_status WHERE rn = 1 AND status = 'finished'
				`, [], (err, rows) => err ? reject(err) : resolve(rows || []));
			});

			const results = [];

			for (const f of finished) {
				// 2. Считаем штуки
				const totalItems = await calculateTotalItems(f.operator_id, f.operation_id, f.work_order_id);

				// 3. Считаем активное время (надёжный метод через события)
				const totalActiveSeconds = await calculateTotalActiveSeconds(f.operator_id, f.operation_id, f.work_order_id);

				// 4. Цикл
				const cycleMin = (totalItems > 0 && totalActiveSeconds > 0)
					? (totalActiveSeconds / totalItems) / 60
					: 0;

				// 5. Метаданные операции
				const meta = await new Promise((resolve, reject) => {
					db.get(
						`SELECT op.operation_name, p.product_name
						 FROM operations op
						 LEFT JOIN products p ON op.product_id = p.product_id
						 WHERE op.operation_id = ?`,
						[f.operation_id],
						(err, row) => err ? reject(err) : resolve(row || {})
					);
				});

				results.push({
					operation_id: f.operation_id,
					operation_name: meta.operation_name || f.operation_id,
					work_order_id: f.work_order_id,
					product_name: meta.product_name || '—',
					total_count: totalItems,
					cycle_minutes: Number(cycleMin.toFixed(2)),
					active_seconds: totalActiveSeconds
				});
			}

			res.json({
				status: "ok",
				date: new Date().toISOString().slice(0, 10),
				data: results
			});

		} catch (err) {
			console.error("[operations_daily ERROR]", err);
			res.status(500).json({ error: err.message });
		}
	});

    // --- 📅 Операции за неделю (ФИНАЛЬНЫЙ ИСПРАВЛЕННЫЙ) ---
    router.get('/operations_weekly', async (req, res) => {
        try {
            const sql = `
                WITH last_status AS (
                    SELECT operation_id, work_order_id, operator_id, status,
                           ROW_NUMBER() OVER (PARTITION BY operation_id, work_order_id ORDER BY journal_id DESC) as rn
                    FROM journal WHERE timestamp >= datetime('now','-6 days','start of day')
                ),
                finished_week AS (
                    SELECT DISTINCT operation_id, work_order_id, operator_id 
                    FROM last_status WHERE rn = 1 AND status = 'finished'
                )
                SELECT 
                    f.operation_id, f.work_order_id,
                    op.operation_name, p.product_name,
                    /* Для недели НЕ ставим фильтр date('now'), чтобы считать за все 7 дней */
                    (SELECT SUM(COALESCE(item_count, 0)) FROM journal 
                     WHERE operation_id = f.operation_id AND work_order_id = f.work_order_id 
                     AND event_type = 'COUNT_ITEM' AND timestamp >= datetime('now','-6 days','start of day')) as total_count,
                    (SELECT 
                        SUM(CASE WHEN event_type IN ('PAUSE_OP', 'END_OP_SESSION', 'FINISH_OP') THEN strftime('%s', timestamp)
                                 WHEN event_type IN ('START_OP', 'RESUME_OP') THEN -strftime('%s', timestamp)
                                 ELSE 0 END)
                     FROM journal 
                     WHERE operation_id = f.operation_id AND work_order_id = f.work_order_id 
                     AND timestamp >= datetime('now','-6 days','start of day')) as active_sec
                FROM finished_week f
                LEFT JOIN operations op ON f.operation_id = op.operation_id
                LEFT JOIN products p ON op.product_id = p.product_id
            `;

            db.all(sql, [], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                
                const data = rows.map(r => {
                    const cycle = (r.total_count > 0 && r.active_sec > 0) ? (r.active_sec / r.total_count) / 60 : 0;
                    return {
                        ...r,
                        avg_cycle_minutes: Number(cycle.toFixed(2)) // Время цикла за неделю
                    };
                });
                res.json({ status: "ok", data });
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
    return router;
};

