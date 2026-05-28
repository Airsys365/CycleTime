// =====================
// 📊 Dashboard: Downtime Chart (CSS-only)
// =====================
async function loadDowntimeChart() {
  const container = document.getElementById("downtime-chart-container");
  if (!container) return;

  try {
    // Загружаем причины простоя
    const reasonsResponse = await fetch("/api/downtime_reasons");
    const reasonsData = await reasonsResponse.json();
    
    const reasonsMap = {};
    reasonsData.forEach(reason => {
      reasonsMap[reason.reason_id] = reason.reason_description_en;
    });

    // Загружаем статистику простоев
    const response = await fetch("/api/reports/downtime_summary");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; color:#aaa; padding:20px;">
          Нет данных о простоях
        </div>
      `;
      return;
    }

    // 🔥 Исключаем плановые перерывы (401-кофе, 402-обед, 403-перерыв, 404-собрание)
	const scheduledBreaks = ['401', '402', '403'];
	const finalData = data.data.filter(item => {
	  return !scheduledBreaks.includes(item.reason.toString());
	});

    console.log("🎯 ФИНАЛЬНЫЕ данные для отрисовки:", finalData);

    // 🔥 Отрисовываем ТОЛЬКО отфильтрованные данные
    renderCssChart(finalData, reasonsMap);
    
  } catch (err) {
    console.error("❌ Error loading downtime chart:", err);
    container.innerHTML = `<p style="color:#f55;">Ошибка загрузки данных</p>`;
  }
}

function renderCssChart(downtimeData, reasonsMap) {
  console.log("🎨 Отрисовываем данные:", downtimeData); // 🔥 ДОБАВЬТЕ ЭТО
  
  const maxSeconds = Math.max(...downtimeData.map(item => item.seconds));
  const colors = ['#ff5252', '#ff9800', '#4caf50', '#2196f3', '#9c27b0'];
  
  const chartHtml = `
    <div style="
      max-width: 50%; 
      margin: 0 auto;
      background: #1a1a1a; 
      padding: 20px; 
      border-radius: 10px;
    ">
      <h4 style="margin: 0 0 15px 0; color: #eee; text-align: center;">Downtime by reason</h4>
      
      ${downtimeData.map((item, index) => {
        console.log("📊 Отрисовываем причину:", item.reason); // 🔥 И ЭТО
        return `
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
          <div style="width: 150px; font-size: 12px; color: #ccc; text-align: right; padding-right: 10px;">
            ${reasonsMap[item.reason] || `Reason ${item.reason}`}
          </div>
          <div style="flex: 1; display: flex; align-items: center;">
            <div style="
              background: ${colors[index % colors.length]};
              height: 20px;
              width: ${(item.seconds / maxSeconds) * 100}%;
              border-radius: 3px;
              margin-right: 10px;
            "></div>
            <div style="font-size: 11px; color: #999; min-width: 40px;">
              ${(item.seconds / 60).toFixed(1)}м
            </div>
          </div>
        </div>
      `}).join('')}
      
      <div style="text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px solid #333; color: #aaa; font-size: 12px;">
        Total Downtime Day: ${(downtimeData.reduce((sum, item) => sum + item.seconds, 0) / 60).toFixed(1)} min
      </div>
    </div>
  `;

  document.getElementById('downtime-chart-container').innerHTML = chartHtml;
}

// Автообновление
setInterval(loadDowntimeChart, 60000);
document.addEventListener("DOMContentLoaded", loadDowntimeChart);