// db_imports.js 
module.exports = function setupExcelImport(app, db, upload, xlsx) {

  app.post('/api/import/excel', upload.single('file'), (req, res) => {
    try {
      const fileName = req.file.originalname.toLowerCase();
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);
      let imported = 0;

      console.log(`📥 Importing ${fileName}... total ${data.length} rows`);

      // ========================================================
      // 🟢 1. IMPORT OPERATORS (FULLY FIXED)
      // ========================================================
      if (fileName.includes('operators')) {

        let lastId = null;

        // читаем последний TLN номер
        db.get(
          `SELECT operator_id FROM operators ORDER BY operator_id DESC LIMIT 1`,
          [],
          (err, row) => {
            lastId = row ? parseInt(row.operator_id.replace("TLN", "")) : 0;

            const insertNext = (index) => {
              if (index >= data.length) {
                console.log(`✅ Operators import complete (${index})`);
                return res.json({ status: 'ok', imported: index });
              }

              const r = data[index];
              if (!r.operator_name) return insertNext(index + 1);

              lastId++;
              const newId = "TLN" + String(lastId).padStart(5, "0");

              db.run(
                `INSERT INTO operators (operator_id, operator_name) VALUES (?, ?)`,
                [newId, r.operator_name],
                (err2) => {
                  if (err2) {
                    console.error("❌ INSERT FAILED:", err2.message);
                  }
                  insertNext(index + 1);
                }
              );
            };

            insertNext(0);
          }
        );

        return; // 🔥 обязательно, чтобы не вызвать второй res.json!
      }

      // ========================================================
      // 🟡 2. IMPORT OPERATIONS
      // ========================================================
      else if (fileName.includes('operations')) {
		  data.forEach(row => {
			db.run(
			  `INSERT OR REPLACE INTO operations 
			   (operation_id, operation_name, product_id, product_name, standard_cycle_time)
			   VALUES (?, ?, ?, ?, ?)`,
			  [
				row.operation_id,
				row.operation_name,
				row.product_id,   // Берем из Excel (image_5ec1b8.png)
				row.product_name, // Берем из Excel (image_5ec1b8.png)
				row.standard_cycle_time
			  ]
			);
			imported++;
		  });
		}

      // ========================================================
      // 🟠 3. IMPORT DOWNTIME REASONS
      // ========================================================
      else if (fileName.includes('downtime')) {
        data.forEach(row => {
          db.run(
            `INSERT OR REPLACE INTO downtime_reasons
             (reason_id, reason_description_ru, reason_description_en, reason_description_et)
             VALUES (?, ?, ?, ?)`,
            [
              row.reason_id,
              row.reason_description_ru,
              row.reason_description_en,
              row.reason_description_et
            ]
          );
          imported++;
        });
      }

      // ========================================================
      // 🔵 4. IMPORT COMPONENTS
      // ========================================================
      else if (fileName.includes('components')) {
        data.forEach(row => {
          db.get(
            `SELECT product_id FROM products WHERE product_name = ?`,
            [row.product_type],
            (err, prodRow) => {
              const productId = prodRow ? prodRow.product_id : row.product_type;

              db.run(
                `INSERT OR REPLACE INTO components
                 (component_id, component_name, product_type)
                 VALUES (?, ?, ?)`,
                [
                  row.component_id,
                  row.component_name,
                  productId
                ]
              );
            }
          );
          imported++;
        });
      }

      // ========================================================
      // 🔴 5. IMPORT DEFECTS
      // ========================================================
      else if (fileName.includes('defects')) {
        data.forEach(row => {
          db.run(
            `INSERT OR REPLACE INTO defects
             (defect_id, defect_description_ru, defect_description_en, defect_description_et)
             VALUES (?, ?, ?, ?)`,
            [
              row.defect_id,
              row.defect_description_ru,
              row.defect_description_en,
              row.defect_description_et
            ]
          );
          imported++;
        });
      }

      // ========================================================
      // ❓ UNKNOWN FILE TYPE
      // ========================================================
      else {
        return res.status(400).json({ error: 'Unknown file type' });
      }

      console.log(`✅ Imported ${imported} records from ${fileName}`);
      res.json({ status: 'ok', imported });

    } catch (err) {
      console.error('❌ Excel import error:', err);
      res.status(500).json({ error: err.message });
    }
  });

};
