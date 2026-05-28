// =====================
// 📦 Dashboard: Прогресс по продуктам
// =====================

async function loadProductProgress() {
    const container = document.getElementById("product-progress");
    if (!container) return;

    try {
        console.log("🔄 Загружаем прогресс по продуктам...");
        const response = await fetch("/api/reports/product_summary");
        if (!response.ok) throw new Error(`Ошибка ${response.status}`);
        const data = await response.json();

        console.log("✅ Прогресс получен:", data);

        container.innerHTML = ""; // очистка перед перерисовкой

        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = "<p>Нет данных для отображения.</p>";
            return;
        }

        data.forEach(prod => {
            const { work_order_id, product_name, planned, produced } = prod;
			const percent = planned > 0 ? Math.min(100, (produced / planned) * 100) : 0;

			const card = document.createElement("div");
			card.className = "product-card";

			// главный заголовок — что есть: сначала ордер, если его нет — product_name
			const mainLabel = work_order_id || product_name || "—";

			// вторую строку показываем ТОЛЬКО если у нас есть и ордер, и продукт, и они различаются
			let productLine = "";
			if (product_name && work_order_id && product_name !== work_order_id) {
			  productLine = `<div style="color:#aaa;font-size:0.9em;margin-top:-5px;">${product_name}</div>`;
			}

			card.innerHTML = `
			  <h3>${mainLabel}</h3>
			  ${productLine}
			  <p>План: ${planned ?? 0} &nbsp;|&nbsp; Факт: ${produced ?? 0}</p>
			  <div class="progress-bar">
				  <div class="progress-bar-inner" style="width:${percent}%;"></div>
			  </div>
			  <p style="margin-top:5px;">${percent.toFixed(1)}%</p>
			`;


            container.appendChild(card);
        });

    } catch (err) {
        console.error("❌ Ошибка загрузки данных:", err);
        container.innerHTML = `<p style="color:#f55;">Ошибка загрузки данных</p>`;
    }
}

// ⏱️ автообновление каждые 30 секунд
setInterval(loadProductProgress, 30000);

// 🚀 первый запуск при загрузке страницы
document.addEventListener("DOMContentLoaded", loadProductProgress);
