console.log("📁 excel_import.js loaded");

// =================================================================
// 1) Подгрузка списка таблиц SQLite
// =================================================================
async function loadSQLiteTables() {
    const select = document.getElementById("sqlite-table");

    try {
        const res = await fetch("/api/admin/get_tables");
        const tables = await res.json();

        select.innerHTML = "";
        tables.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error(e);
        alert("Error loading table.");
    }
}


// =================================================================
// 2) Чтение Excel-файла на клиенте
// =================================================================
let excelData = null;

async function previewExcel() {
    const fileInput = document.getElementById("excel-file");
    const previewDiv = document.getElementById("excel-preview");

    if (!fileInput.files.length) {
        alert("Choose Excel");
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // конвертация в JSON
        excelData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        // предпросмотр
        renderPreview(excelData);
    };

    reader.readAsArrayBuffer(file);
}

function renderPreview(rows) {
    const preview = document.getElementById("excel-preview");
    preview.innerHTML = "";

    if (!rows || rows.length === 0) {
        preview.innerHTML = "<p>Empty or not recognised</p>";
        return;
    }

    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";

    // --- Заголовок ---
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    Object.keys(rows[0]).forEach(col => {
        const th = document.createElement("th");
        th.textContent = col;
        th.style.border = "1px solid #ddd";
        th.style.padding = "6px";
        th.style.background = "#eee";
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // --- Данные ---
    const tbody = document.createElement("tbody");

    rows.slice(0, 50).forEach(r => {
        const tr = document.createElement("tr");
        Object.keys(rows[0]).forEach(col => {
            const td = document.createElement("td");
            td.textContent = r[col];
            td.style.border = "1px solid #ddd";
            td.style.padding = "6px";
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    preview.appendChild(table);
}


// =================================================================
// 3) Импорт данных в SQLite через сервер
// =================================================================
async function importToSQLite() {
    const table = document.getElementById("sqlite-table").value;

    if (!table) {
        alert("Choose Table.");
        return;
    }
    if (!excelData) {
        alert("First choose file and review.");
        return;
    }

    if (!confirm(`Import ${excelData.length} rows into table "${table}"?\nOld data will be rewrite.`)) {
        return;
    }

    try {
        const res = await fetch("/api/admin/import_excel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                table,
                rows: excelData
            })
        });

        const json = await res.json();

        if (json.status === "ok") {
            alert("Imported!");
        } else {
            alert("Error: " + json.error);
        }
    } catch (err) {
        console.error(err);
        alert("Import error");
    }
}


// =================================================================
// 4) Привязка кнопок
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
    
    loadSQLiteTables();

    document.getElementById("preview-btn").addEventListener("click", previewExcel);
    document.getElementById("import-btn").addEventListener("click", importToSQLite);
});
// =================================================================
// 5) Стилизация кнопки выбора файла
// =================================================================
function setupFileButton() {
    const fileInput = document.getElementById("excel-file");
    const fileButton = document.getElementById("choose-file-btn");
    const fileNameSpan = document.getElementById("file-name");

    fileButton.addEventListener("click", function() {
        fileInput.click();
    });

    fileInput.addEventListener("change", function() {
        if (fileInput.files.length > 0) {
            fileNameSpan.textContent = fileInput.files[0].name;
        } else {
            fileNameSpan.textContent = "";
        }
    });
}

// Обновите функцию DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
    loadSQLiteTables();
    setupFileButton(); // Добавьте эту строку
    
    document.getElementById("preview-btn").addEventListener("click", previewExcel);
    document.getElementById("import-btn").addEventListener("click", importToSQLite);
});