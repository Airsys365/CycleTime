const express = require("express");
const router = express.Router();

module.exports = (db) => {
    const query = (sql, params = []) => new Promise((res, rej) => {
        db.all(sql, params, (err, rows) => err ? rej(err) : res(rows || []));
    });
	// --- НОВЫЕ МАРШРУТЫ ДЛЯ ВЫПАДАЮЩИХ СПИСКОВ ---
    router.get('/filters/list', async (req, res) => {
        try {
            const products = await query("SELECT DISTINCT product_name FROM work_orders_plan ORDER BY product_name");
            const operations = await query("SELECT DISTINCT operation_name FROM operations ORDER BY operation_name");
            const operators = await query("SELECT DISTINCT operator_name FROM operators ORDER BY operator_name");
            const components = await query("SELECT DISTINCT component_name FROM components ORDER BY component_name");
            const defects = await query("SELECT DISTINCT defect_description_en FROM defects ORDER BY defect_description_en");
            
            res.json({ status: "ok", data: { products, operations, operators, components, defects } });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    // 1. Production Plan (Filters: wo, product)
    router.get('/production_plan', async (req, res) => {
        const { start_date, end_date, wo, product } = req.query;
        let params = [start_date, end_date];
        let filter = "";
        if (wo) { filter += " AND p.work_order_id LIKE ?"; params.push(`%${wo}%`); }
        if (product) { filter += " AND p.product_name LIKE ?"; params.push(`%${product}%`); }

        const sql = `SELECT p.work_order_id, p.product_name, p.planned_total, SUM(COALESCE(j.item_count, 0)) as actual_total
                     FROM work_orders_plan p
                     LEFT JOIN journal j ON p.work_order_id = j.work_order_id AND j.event_type = 'COUNT_ITEM'
                     WHERE date(j.timestamp) BETWEEN ? AND ? ${filter}
                     GROUP BY p.work_order_id HAVING actual_total > 0 OR p.planned_total > 0 LIMIT 15`;
        try { res.json({ status: "ok", data: await query(sql, params) }); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // 2. Cycle Performance (Filters: wo, product, operation)
    router.get('/cycle_performance_stats', async (req, res) => {
        const { start_date, end_date, wo, product, operation } = req.query;
        let params = [start_date, end_date];
        let filter = "";
        if (wo) { filter += " AND j.work_order_id LIKE ?"; params.push(`%${wo}%`); }
        if (product) { filter += " AND p.product_name LIKE ?"; params.push(`%${product}%`); }
        if (operation) { filter += " AND o.operation_name LIKE ?"; params.push(`%${operation}%`); }

        const sql = `SELECT o.operation_name as operation, o.standard_cycle_time, SUM(j.item_count) as items,
                     (strftime('%s', MAX(j.timestamp)) - strftime('%s', MIN(j.timestamp))) as sec
                     FROM journal j 
                     JOIN operations o ON j.operation_id = o.operation_id
                     LEFT JOIN work_orders_plan p ON j.work_order_id = p.work_order_id
                     WHERE j.event_type IN ('START_OP', 'FINISH_OP', 'COUNT_ITEM')
                       AND date(j.timestamp) BETWEEN ? AND ? ${filter}
                     GROUP BY j.operation_id HAVING items > 0 LIMIT 15`;
        try { 
            const rows = await query(sql, params);
            res.json({ status: "ok", data: rows.map(r => ({
                operation: r.operation,
                actual_cycle: Number(((r.sec / r.items) / 60).toFixed(2)),
                planned_cycle: Number((r.standard_cycle_time / 60).toFixed(2))
            })) });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // 3. Downtime Stats (Filter: wo)
    router.get('/downtime_stats', async (req, res) => {
        const { start_date, end_date, wo } = req.query;
        let params = [start_date, end_date];
        let filter = "";
        if (wo) { filter += " AND j.work_order_id LIKE ?"; params.push(`%${wo}%`); }

        const sql = `SELECT dr.reason_description_en as reason, SUM(strftime('%s', j.end_time) - strftime('%s', j.start_time))/60 as minutes
                     FROM journal j JOIN downtime_reasons dr ON j.reason_id = dr.reason_id
                     WHERE j.event_type = 'PAUSE_OP' AND j.reason_id NOT IN ('401', '402')
                       AND date(j.timestamp) BETWEEN ? AND ? ${filter}
                     GROUP BY j.reason_id ORDER BY minutes DESC LIMIT 10`;
        try { res.json({ status: "ok", data: await query(sql, params) }); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // 4. Top Defects (Filters: product, defect, component)
    router.get('/quality_stats', async (req, res) => {
        const { start_date, end_date, product, defect, component } = req.query;
        let params = [start_date, end_date];
        let filter = "";
        if (product) { filter += " AND p.product_name LIKE ?"; params.push(`%${product}%`); }
        if (defect) { filter += " AND d.defect_description_en LIKE ?"; params.push(`%${defect}%`); }
        if (component) { filter += " AND c.component_name LIKE ?"; params.push(`%${component}%`); }

        const sql = `SELECT d.defect_description_en as name, COUNT(*) as count
                     FROM defect_journal dj 
                     JOIN defects d ON dj.defect_id = d.defect_id
                     LEFT JOIN components c ON dj.component_id = c.component_id
                     LEFT JOIN journal jm ON dj.serial_number = jm.serial_number
                     LEFT JOIN work_orders_plan p ON jm.work_order_id = p.work_order_id
                     WHERE date(dj.timestamp) BETWEEN ? AND ? ${filter}
                     GROUP BY dj.defect_id ORDER BY count DESC LIMIT 10`;
        try { res.json({ status: "ok", data: await query(sql, params) }); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // 5. Top Operators (Sort by Cycle Time ASC, Filters: operator, operation)
    router.get('/operator_performance', async (req, res) => {
        const { start_date, end_date, operator, operation } = req.query;
        let params = [start_date, end_date];
        let filter = "";
        if (operator) { filter += " AND o.operator_name LIKE ?"; params.push(`%${operator}%`); }
        if (operation) { filter += " AND op.operation_name LIKE ?"; params.push(`%${operation}%`); }

        const sql = `SELECT o.operator_name as name, SUM(j.item_count) as items,
                     (strftime('%s', MAX(j.timestamp)) - strftime('%s', MIN(j.timestamp))) as sec
                     FROM journal j 
                     JOIN operators o ON j.operator_id = o.operator_id
                     JOIN operations op ON j.operation_id = op.operation_id
                     WHERE j.event_type IN ('START_OP', 'FINISH_OP', 'COUNT_ITEM')
                       AND date(j.timestamp) BETWEEN ? AND ? ${filter}
                     GROUP BY j.operator_id HAVING items > 0 
                     ORDER BY (sec/items) ASC LIMIT 10`; 
        try { 
            const rows = await query(sql, params);
            res.json({ status: "ok", data: rows.map(r => ({
                name: r.name,
                cycle: Number(((r.sec / r.items) / 60).toFixed(2)) 
            })) });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // 6. Traceability Search
    router.get('/trace/:sn', async (req, res) => {
        const sql = `SELECT j.timestamp, j.event_type, j.serial_number, o.operation_name
                     FROM journal j LEFT JOIN operations o ON j.operation_id = o.operation_id
                     WHERE j.serial_number LIKE ? ORDER BY j.timestamp ASC LIMIT 50`;
        try { res.json({ status: "ok", data: { history: await query(sql, [`%${req.params.sn}%`]) } }); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    return router;
};