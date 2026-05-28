console.log("📊 defects_dashboard.js LOADED");

// Load JSON helper
async function loadJSON(url) {
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (err) {
        console.error(`❌ Error loading ${url}`, err);
        return [];
    }
}

// Compact bar chart
function renderBarChart(ctx, labels, data) {
    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: '#29b6f6',
                borderColor: '#0288d1',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,   // critical: allows compact charts
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Render ONE product block
async function renderProduct(product) {
  const productName = product.product_name;
  const domId = String(productName).replace(/[^a-zA-Z0-9_-]/g, "_");

  const components = await loadJSON(
    `/api/reports/defects/${encodeURIComponent(productName)}/top_components`
  );
  const defects = await loadJSON(
    `/api/reports/defects/${encodeURIComponent(productName)}/top_defects`
  );

  if (components.length === 0 && defects.length === 0) return;

  const container = document.getElementById("defects-dashboard");

  const card = document.createElement("div");
  card.className = "product-card";
  card.style.padding = "15px";
  card.style.background = "#1a1a1a";
  card.style.borderRadius = "10px";

  card.innerHTML = `
    <h2 style="text-align:center; margin-bottom:15px;">${productName}</h2>

    <h4>Top 5 Components</h4>
    <div class="chart-wrapper" style="margin-bottom:25px;">
      <canvas id="comp-${domId}"></canvas>
    </div>

    <h4>Top 5 Defect Types</h4>
    <div class="chart-wrapper">
      <canvas id="def-${domId}"></canvas>
    </div>
  `;

  container.appendChild(card);

  if (components.length > 0) {
    renderBarChart(
      document.getElementById(`comp-${domId}`),
      components.map(x => x.component_name),
      components.map(x => x.defect_count)
    );
  }

  if (defects.length > 0) {
    renderBarChart(
      document.getElementById(`def-${domId}`),
      defects.map(x => x.defect_name),
      defects.map(x => x.defect_count)
    );
  }
}


// MAIN
async function renderDefectsDashboard() {
    const products = await loadJSON("/api/reports/defects/products");

    document.getElementById("defects-dashboard").innerHTML = "";

    for (const product of products) {
        await renderProduct(product);
    }
}

renderDefectsDashboard();


