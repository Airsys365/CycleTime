// =====================
// 🟢 Dashboard Live: Текущие операции (из /live_from_summary)
// =====================

async function loadLiveOperations() {
  const tableBody = document.getElementById("live-body");
  if (!tableBody) {
    console.error("❌ Не найден tableBody с id='live-body'");
    return;
  }

  try {
    console.log("🔄 Загружаем live_from_summary...");

    const response = await fetch("/api/reports/live_from_summary");
    console.log("📡 Ответ сервера:", response.status, response.statusText);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const payload = await response.json();
    console.log("📊 Получены данные:", payload);

    const rows = Array.isArray(payload.data) ? payload.data : [];
    console.log("📋 Обрабатываем строки:", rows.length);

    tableBody.innerHTML = "";

    if (!rows.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" style="padding:8px; text-align:center; color:#aaa;">
            No active operations
          </td>
        </tr>
      `;
      console.log("ℹ️ No active operations");
      return;
    }

    console.log("🔄 Обрабатываем операции...");

    for (const row of rows) {
      console.log("🔍 Строка:", row);
      const tr = document.createElement("tr");

      // статус
      const statusLabel = row.status === 'paused' ? 'Paused' : 'Active';
      const statusColor = row.status === 'paused' ? '#ff9800' : '#00bcd4';

      // === 💥 НОВОЕ — цикл берём ИЗ live_from_summary, а не slot_stats ===
      const actualCycle = row.actual_cycle || row.actual_cycle_minutes || 0;
	  const plannedCycle = (row.planned_cycle ?? 0) > 0
		  ? Number(row.planned_cycle)
		  : ((row.plan_sec || 0) / 60); 

      let cycleTimeText = "—";
		let cycleTimeColor = "#ccc";

		if (actualCycle > 0) {
			cycleTimeText = `${actualCycle.toFixed(2)} min`;

			if (plannedCycle > 0) {
				if (actualCycle <= plannedCycle) cycleTimeColor = "#00c853";
				else if (actualCycle <= plannedCycle * 1.2) cycleTimeColor = "#ff9800";
				else cycleTimeColor = "#ff5252";
			} else {
				cycleTimeColor = "#00bcd4"; // без плана — синим
			}
		}

      tr.innerHTML = `
			<td style="padding:8px; text-align:center;">${row.operator_name || "—"}</td>

			<td style="padding:8px; text-align:center;">
			  ${row.operation_name || row.operation || row.operation_id || "—"}
			</td>

			<td style="padding:8px; text-align:center;">${row.product_name || "—"}</td>

			<td style="padding:8px; text-align:center;">${row.work_order_id || "—"}</td>

			<td style="padding:8px; text-align:center;">${row.total_count || 0}</td>

			<td style="padding:8px; text-align:center; color:${statusColor}; font-weight:bold;">
			  ${statusLabel}
			</td>

			<td style="padding:8px; text-align:center;">
				${formatActiveTime(row)}
			</td>

			<td style="padding:8px; text-align:center; color:${cycleTimeColor}; font-weight:bold;">
			  ${cycleTimeText}
			</td>
			<td style="padding:8px; text-align:center; color:#888;">
			  ${row.planned_cycle ? row.planned_cycle.toFixed(2) + ' min' : '—'}
			</td>
		`;

      tableBody.appendChild(tr);
    }

    console.log("✅ Данные успешно загружены");

  } catch (err) {
    console.error("❌ Ошибка загрузки live_from_summary:", err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="padding:8px; text-align:center; color:#f55;">
          Ошибка загрузки данных: ${err.message}
        </td>
      </tr>
    `;
  }
}
function formatActiveTime(row) {
    const sec = row.active_seconds || row.active_time_seconds || 0;

    if (!sec || sec <= 0) return "—";

    // показываем в минутах с одной точкой
    const minutes = (sec / 60).toFixed(1);
    return `${minutes} min`;
}

// ⏱️ автообновление каждые 30 секунд
setInterval(loadLiveOperations, 30000);

// 🚀 первый запуск
document.addEventListener("DOMContentLoaded", loadLiveOperations);
