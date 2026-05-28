// =====================
// 📦 Dashboard: План по ордерам
// =====================

async function loadOrdersPlan() {
  const container = document.getElementById("orders-plan-list");
  if (!container) return;

  try {
    console.log("🔄 Загружаем план по ордерам...");
    const response = await fetch("/api/reports/orders_plan");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    container.innerHTML = "";

    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = "<p>Нет данных для отображения.</p>";
      return;
    }

    data.forEach(order => {
      const { work_order_id, product_name, planned_total, produced } = order;
      const percent = planned_total > 0 ? Math.min(100, (produced / planned_total) * 100) : 0;

      const card = document.createElement("div");
      card.className = "product-card";
      card.style.width = "100%";
      card.style.maxWidth = "700px";
      card.style.margin = "0 auto";

      card.innerHTML = `
		  <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.1em;">
			<div>Ордер: ${work_order_id}</div>
			<div>${percent.toFixed(1)}%</div>
		  </div>

		  <div style="color:#aaa; font-size:0.9em; margin-bottom:8px;">
			Product: ${product_name || "—"}
		  </div>

		  <div style="font-size:0.9em; margin-bottom:5px;">
			Plan: <b>${planned_total ?? 0}</b> &nbsp;|&nbsp; Факт: <b>${produced ?? 0}</b>
		  </div>

		  <div style="font-size:0.9em; color:#ccc; margin-bottom:8px;">
			Avg cycle: <b>${order.avg_cycle ? order.avg_cycle + " с" : "—"}</b>
		  </div>

		  <div class="progress-bar">
			<div class="progress-bar-inner" 
				 style="width:${percent}%; background:${percent >= 100 ? '#00c853' : '#2196f3'};">
			</div>
		  </div>
		`;


      container.appendChild(card);
    });
  } catch (err) {
    console.error("❌ Ошибка загрузки плана по ордерам:", err);
    container.innerHTML = `<p style="color:#f55;">Ошибка загрузки данных</p>`;
  }
}

// 🔁 автообновление каждые 60 секунд
setInterval(loadOrdersPlan, 60000);

// 🚀 запуск при загрузке страницы
document.addEventListener("DOMContentLoaded", loadOrdersPlan);
