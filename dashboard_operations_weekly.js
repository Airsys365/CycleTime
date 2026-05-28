// =====================
// 📅 Dashboard: Операции за неделю
// =====================

async function loadOperationsWeekly() {
  const container = document.getElementById("operations-weekly-container");
  if (!container) return;

  try {
    console.log("🔄 Загружаем операции за неделю...");
    const res = await fetch("/api/reports/operations_weekly");
    const json = await res.json();
    const data = json.data || [];
    console.log("📊 Weekly data:", data.length, "rows");

    container.innerHTML = "";

    if (data.length === 0) {
      container.innerHTML = `
        <div class="product-card">
          <h3>📅 Operations this week</h3>
          <p style="text-align:center; color:#aaa;">No data for this week</p>
        </div>
      `;
      return;
    }

    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <h3>📅 Operations this week</h3>
      <div style="overflow-x: auto; margin-top: 15px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
          <thead>
            <tr style="background: #222; color: #ccc;">
              <th style="padding: 8px; text-align: left;">Operation</th>
              <th style="padding: 8px; text-align: left;">Product</th>
              <th style="padding: 8px; text-align: right;">Output</th>
              <th style="padding: 8px; text-align: right;">Avg Cycle</th>
            </tr>
          </thead>
          <tbody id="operations-weekly-body"></tbody>
        </table>
      </div>
    `;

    container.appendChild(card);
    renderOperationsWeeklyTable(data);

  } catch (err) {
    console.error("❌ Ошибка загрузки операций за неделю:", err);
    container.innerHTML = `<p style="color:#f55;">Ошибка загрузки данных</p>`;
  }
}

function getCycleStyle(cycleMin, plannedMin) {
  if (!cycleMin || cycleMin <= 0) return '';
  if (!plannedMin || plannedMin <= 0) return 'color:#2196f3; font-weight:bold;'; // нет эталона — синий
  if (cycleMin <= plannedMin) return 'color:#00c853; font-weight:bold;';          // ok — зелёный
  if (cycleMin <= plannedMin * 1.2) return 'color:#ff9800; font-weight:bold;';    // warning — оранжевый
  return 'color:#ff5252; font-weight:bold;';                                       // bad — красный
}

function renderOperationsWeeklyTable(data) {
  const tbody = document.getElementById("operations-weekly-body");

  tbody.innerHTML = data.map(row => {
    // Поддержка обоих имён полей с сервера
    const cycle = row.cycle_minutes || row.avg_cycle_minutes || 0;
    const planned = row.planned_cycle_minutes || null;
    const style = getCycleStyle(cycle, planned);

    return `
      <tr style="border-bottom: 1px solid #333;">
        <td style="padding: 8px;">
          <div style="font-weight: bold;">${row.operation_name || row.operation_id || '—'}</div>
        </td>
        <td style="padding: 8px;">${row.product_name || '—'}</td>
        <td style="padding: 8px; text-align: right; font-weight: bold;">${row.total_count || 0}</td>
        <td style="padding: 8px; text-align: right; ${style}">
          ${cycle > 0 ? cycle + ' min' : '—'}
        </td>
      </tr>
    `;
  }).join('');
}

// Автообновление каждые 2 минуты
setInterval(loadOperationsWeekly, 120000);

document.addEventListener("DOMContentLoaded", () => {
  try {
    console.log("📅 weekly script: DOMContentLoaded fired");
    loadOperationsWeekly();
  } catch (e) {
    console.error("❌ weekly script error:", e);
  }
});