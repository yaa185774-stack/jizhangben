/**
 * 统计图表模块
 * 使用 Chart.js 绘制饼图和柱状图
 */

let pieChart = null;
let barChart = null;

/**
 * 渲染支出分类饼图
 * @param {string} yearMonth - 月份 "YYYY-MM"
 */
async function renderPieChart(yearMonth) {
  const ctx = document.getElementById('pieChart').getContext('2d');
  const data = await getCategorySummary(yearMonth);

  // 销毁旧图表
  if (pieChart) {
    pieChart.destroy();
    pieChart = null;
  }

  if (data.length === 0) {
    // 无数据时清空画布
    ctx.canvas.style.display = 'none';
    const container = ctx.canvas.parentElement;
    let placeholder = container.querySelector('.chart-empty');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'chart-empty';
      placeholder.style.cssText = 'text-align:center;padding:40px 0;color:#999;font-size:14px;';
      placeholder.textContent = '暂无支出数据';
      container.appendChild(placeholder);
    }
    placeholder.style.display = 'block';
    document.getElementById('pieChart').style.display = 'none';
    return;
  }

  // 显示 canvas，隐藏占位符
  ctx.canvas.style.display = 'block';
  const container = ctx.canvas.parentElement;
  const placeholder = container.querySelector('.chart-empty');
  if (placeholder) placeholder.style.display = 'none';

  const colors = [
    '#F44336', '#FF9800', '#FFC107', '#4CAF50', '#2196F3',
    '#9C27B0', '#00BCD4', '#795548', '#607D8B', '#E91E63'
  ];

  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.category),
      datasets: [{
        data: data.map(d => d.total),
        backgroundColor: colors.slice(0, data.length),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 10,
            font: { size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? Math.round(ctx.parsed / total * 100) : 0;
              return ` ${ctx.label}: ¥${ctx.parsed.toFixed(2)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * 渲染近6个月收支趋势柱状图
 */
async function renderBarChart() {
  const ctx = document.getElementById('barChart').getContext('2d');
  const trend = await getMonthlyTrend(6);

  if (barChart) {
    barChart.destroy();
    barChart = null;
  }

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: trend.map(t => t.label),
      datasets: [
        {
          label: '收入',
          data: trend.map(t => t.income),
          backgroundColor: '#4CAF50',
          borderRadius: 6,
          borderSkipped: false
        },
        {
          label: '支出',
          data: trend.map(t => t.expense),
          backgroundColor: '#F44336',
          borderRadius: 6,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyleWidth: 10,
            padding: 16,
            font: { size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ¥${ctx.parsed.y.toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 12 } }
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback: (val) => '¥' + val,
            font: { size: 11 }
          },
          grid: { color: '#f0f0f0' }
        }
      }
    }
  });
}

/**
 * 刷新所有图表
 */
async function refreshCharts(yearMonth) {
  await renderPieChart(yearMonth);
  await renderBarChart();
}
