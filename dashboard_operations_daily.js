// =====================
// 📋 Dashboard: Операции за день
// =====================

async function loadOperationsDaily() {
  const container = document.getElementById("operations-daily-container");
  if (!container) return;

  try {
    console.log("🔄 Загружаем операции за день...");
    const response = await fetch("/api/reports/operations_daily");
    if (!response.ok) throw new Error(`Ошибка ${response.status}`);
    const data = await response.json();
	console.log("📊 Данные operations_daily:", data);

    container.innerHTML = "";

    if (!data.data || data.data.length === 0) {
      container.innerHTML = `
        <div class="product-card">
          <h3>📋 Operations today</h3>
          <p style="text-align:center; color:#aaa;">No data for today</p>
        </div>
      `;
      return;
    }

    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <h3>📋 Operations today (${data.date || new Date().toLocaleDateString()})</h3>
      <div style="overflow-x: auto; margin-top: 15px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
          <thead>
            <tr style="background: #222; color: #ccc;">
              <th style="padding: 8px; text-align: left;">Operator</th>
              <th style="padding: 8px; text-align: left;">Operation</th>
			  <th style="padding: 8px; text-align: left;">WO</th>
			  <th style="padding: 8px; text-align: left;">Product</th>
			  <th style="padding: 8px; text-align: right;">Output</th>
			  <th style="padding: 8px; text-align: right;">Avg Cycle</th>
            </tr>
          </thead>
          <tbody id="operations-daily-body"></tbody>
        </table>
      </div>
    `;

    container.appendChild(card);
    renderOperationsDailyTable(data.data);

  } catch (err) {
    console.error("❌ Ошибка загрузки операций за день:", err);
    container.innerHTML = `<p style="color:#f55;">Ошибка загрузки данных</p>`;
  }
}
function getCycleStyle(status) {
  if (status === 'ok') {
    return 'color:#00c853; font-weight:bold;';
  }
  if (status === 'warning') {
    return 'color:#ff9800; font-weight:bold;';
  }
  if (status === 'bad') {
    return 'color:#ff5252; font-weight:bold;';
  }
  return '';
}

function renderOperationsDailyTable(data) {
  const tbody = document.getElementById("operations-daily-body");
  
  tbody.innerHTML = data.map(row => {
    const cycleVal = row.cycle_minutes;
    const cycleText = cycleVal > 0 ? cycleVal.toFixed(1) + ' min' : '—';
    const cycleStyle = getCycleStyle(row.cycle_status);
    return `
	  <tr style="border-bottom: 1px solid #333;">
		<td style="padding: 8px;">
		  ${row.operator_name || row.operator_id || '—'}
		</td>
		<td style="padding: 8px; font-weight: bold;">
		  ${row.operation_name || row.operation_id || '—'}
		</td>
		<td style="padding: 8px;">
		  ${row.work_order_id || '—'}
		</td>
		<td style="padding: 8px;">
		  ${row.product_name || '—'}
		</td>
		<td style="padding: 8px; text-align: right; font-weight: bold;">
		  ${row.total_count}
		</td>
		<td style="padding: 8px; text-align: right; ${cycleStyle}">
		  ${cycleText}
		</td>
	  </tr>
	`;
  }).join('');

}

// Автообновление
setInterval(loadOperationsDaily, 60000);
document.addEventListener("DOMContentLoaded", loadOperationsDaily);