/**
 * 记账本 - 主应用逻辑
 * Tab 切换、事件绑定、页面渲染
 */

// ==================== 分类数据 ====================

const EXPENSE_CATEGORIES = [
  { name: '餐饮', icon: '🍔' },
  { name: '交通', icon: '🚗' },
  { name: '购物', icon: '🛒' },
  { name: '娱乐', icon: '🎮' },
  { name: '居住', icon: '🏠' },
  { name: '医疗', icon: '💊' },
  { name: '教育', icon: '📚' },
  { name: '其他', icon: '📌' }
];

const INCOME_CATEGORIES = [
  { name: '工资', icon: '💰' },
  { name: '奖金', icon: '🎁' },
  { name: '兼职', icon: '💼' },
  { name: '理财', icon: '📈' },
  { name: '报销', icon: '📋' },
  { name: '红包', icon: '🧧' },
  { name: '退款', icon: '↩️' },
  { name: '其他', icon: '📌' }
];

// ==================== 全局状态 ====================

let currentTab = 'record';
let currentType = 'expense';  // 当前记账类型
let selectedCategory = null;  // 当前选中的分类
let listMonth = '';           // 明细页当前月份
let listFilter = 'all';       // 明细页筛选
let statsMonth = '';          // 统计页当前月份
let deleteTargetId = null;    // 待删除的记录 ID

// ==================== 初始化 ====================

async function init() {
  try {
    await openDB();
  } catch (e) {
    showToast('数据库初始化失败，请刷新页面');
    console.error(e);
    return;
  }

  // 设置默认月份
  const now = new Date();
  const ym = formatYearMonth(now);
  listMonth = ym;
  statsMonth = ym;

  // 设置默认日期
  document.getElementById('inputDate').value = formatDate(now);

  // 渲染各页面
  renderCategoryGrid();
  updateListHeader();
  updateStatsHeader();
  await refreshListPage();
  await refreshStatsPage();

  // 注册 Service Worker
  registerSW();
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 格式化日期为 YYYY-MM
 */
function formatYearMonth(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ==================== Tab 切换 ====================

document.getElementById('tabBar').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  const tab = btn.dataset.tab;
  if (tab) switchTab(tab);
});

function switchTab(tab) {
  currentTab = tab;

  // 更新 Tab 按钮状态
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  // 更新页面显示
  document.querySelectorAll('.tab-page').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));

  // 更新标题
  const titles = { record: '记账本', list: '明细', stats: '统计', me: '我的' };
  document.getElementById('headerTitle').textContent = titles[tab] || '记账本';

  // 切换到统计页时刷新图表
  if (tab === 'stats') {
    refreshStatsPage();
  }

  // 切换到明细页时刷新列表
  if (tab === 'list') {
    refreshListPage();
  }
}

// ==================== Tab 1: 记账 ====================

// 收支类型切换
document.getElementById('btnExpense').addEventListener('click', () => switchType('expense'));
document.getElementById('btnIncome').addEventListener('click', () => switchType('income'));

function switchType(type) {
  currentType = type;
  selectedCategory = null;

  document.getElementById('btnExpense').classList.toggle('active', type === 'expense');
  document.getElementById('btnIncome').classList.toggle('active', type === 'income');

  renderCategoryGrid();
}

// 渲染分类网格
function renderCategoryGrid() {
  const grid = document.getElementById('categoryGrid');
  const categories = currentType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  grid.innerHTML = categories.map(cat => `
    <button class="cat-btn${cat.name === selectedCategory ? ' selected' : ''}"
            data-category="${cat.name}">
      <span class="cat-icon">${cat.icon}</span>
      <span>${cat.name}</span>
    </button>
  `).join('');
}

// 分类点击（使用事件委托）
document.getElementById('categoryGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('.cat-btn');
  if (!btn) return;
  selectedCategory = btn.dataset.category;
  document.querySelectorAll('.cat-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.category === selectedCategory);
  });
});

// 保存记录
document.getElementById('btnSave').addEventListener('click', async () => {
  const amountStr = document.getElementById('inputAmount').value.trim();
  const date = document.getElementById('inputDate').value;
  const note = document.getElementById('inputNote').value.trim();

  // 验证
  const amount = parseFloat(amountStr);
  if (!amountStr || isNaN(amount) || amount <= 0) {
    showToast('请输入有效的金额');
    document.getElementById('inputAmount').focus();
    return;
  }

  if (!selectedCategory) {
    showToast('请选择一个分类');
    return;
  }

  if (!date) {
    showToast('请选择日期');
    return;
  }

  // 构建完整分类名（含图标）
  const categories = currentType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const catObj = categories.find(c => c.name === selectedCategory);
  const fullCategory = catObj ? `${catObj.icon} ${catObj.name}` : selectedCategory;

  try {
    await addTransaction({
      type: currentType,
      amount: Math.round(amount * 100) / 100,
      category: fullCategory,
      date: date,
      note: note
    });

    // 清空表单
    document.getElementById('inputAmount').value = '';
    document.getElementById('inputNote').value = '';
    selectedCategory = null;
    renderCategoryGrid();

    showToast('记账成功！');
  } catch (e) {
    console.error('保存失败:', e);
    showToast('保存失败，请重试');
  }
});

// ==================== Tab 2: 明细 ====================

// 月份切换
document.getElementById('btnPrevMonth').addEventListener('click', () => changeListMonth(-1));
document.getElementById('btnNextMonth').addEventListener('click', () => changeListMonth(1));

function changeListMonth(delta) {
  const [y, m] = listMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  listMonth = formatYearMonth(d);
  updateListHeader();
  refreshListPage();
}

function updateListHeader() {
  const [y, m] = listMonth.split('-');
  document.getElementById('currentMonth').textContent = `${y}年 ${m}月`;
}

// 筛选切换
document.querySelector('.filter-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  listFilter = btn.dataset.filter;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === listFilter);
  });
  refreshListPage();
});

// 刷新明细页
async function refreshListPage() {
  await renderSummary();
  await renderTransactionList();
}

// 渲染月度汇总
async function renderSummary() {
  const summary = await getMonthSummary(listMonth);
  document.getElementById('summaryIncome').textContent = `¥${summary.income.toFixed(2)}`;
  document.getElementById('summaryExpense').textContent = `¥${summary.expense.toFixed(2)}`;
  document.getElementById('summaryBalance').textContent =
    `¥${(summary.income - summary.expense).toFixed(2)}`;
}

// 渲染交易列表
async function renderTransactionList() {
  const container = document.getElementById('transactionList');
  const records = await getTransactionsByMonthAndType(listMonth, listFilter);

  if (records.length === 0) {
    container.innerHTML = '<div class="empty-state">📝 还没有记录<br>去记一笔吧！</div>';
    return;
  }

  container.innerHTML = records.map(r => {
    const isExpense = r.type === 'expense';
    const amountClass = isExpense ? 'expense-amount' : 'income-amount';
    const sign = isExpense ? '-' : '+';
    const iconBg = isExpense ? 'expense-bg' : 'income-bg';

    // 日期只显示月-日
    const dateParts = r.date.split('-');
    const shortDate = `${dateParts[1]}-${dateParts[2]}`;

    return `
      <div class="tx-item" data-id="${r.id}">
        <div class="tx-icon ${iconBg}">${isExpense ? '💸' : '💰'}</div>
        <div class="tx-info">
          <div class="tx-category">${r.category}</div>
          <div class="tx-date-note">
            <span>${shortDate}</span>
            ${r.note ? `<span>${escapeHtml(r.note)}</span>` : ''}
          </div>
        </div>
        <div class="tx-amount ${amountClass}">${sign}¥${parseFloat(r.amount).toFixed(2)}</div>
        <div class="tx-swipe-delete">删除</div>
      </div>
    `;
  }).join('');

  // 绑定触摸事件（滑动手势）
  bindSwipeEvents();
}

// HTML 转义
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 滑动手势处理
let touchStartX = 0;
let touchCurrentX = 0;
let swipedItem = null;

function bindSwipeEvents() {
  const items = document.querySelectorAll('.tx-item');

  items.forEach(item => {
    item.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      // 关闭其他打开的
      if (swipedItem && swipedItem !== item) {
        swipedItem.classList.remove('show-delete');
      }
    }, { passive: true });

    item.addEventListener('touchmove', (e) => {
      touchCurrentX = e.touches[0].clientX;
      const diff = touchStartX - touchCurrentX;

      if (diff > 30) {
        item.classList.add('show-delete');
      } else if (diff < -30) {
        item.classList.remove('show-delete');
      }
    }, { passive: true });

    item.addEventListener('touchend', () => {
      if (item.classList.contains('show-delete')) {
        swipedItem = item;
      }
    });
  });

  // 点击删除按钮
  document.querySelectorAll('.tx-swipe-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('.tx-item');
      deleteTargetId = parseInt(item.dataset.id);
      showDeleteModal();
    });
  });
}

// ==================== 删除弹窗 ====================

function showDeleteModal() {
  document.getElementById('deleteModal').classList.add('show');
}

function hideDeleteModal() {
  document.getElementById('deleteModal').classList.remove('show');
  deleteTargetId = null;
}

document.getElementById('btnCancelDelete').addEventListener('click', hideDeleteModal);

document.getElementById('btnConfirmDelete').addEventListener('click', async () => {
  if (!deleteTargetId) return;
  try {
    await deleteTransaction(deleteTargetId);
    hideDeleteModal();
    await refreshListPage();
    showToast('已删除');
  } catch (e) {
    console.error('删除失败:', e);
    showToast('删除失败');
  }
});

// 点击弹窗遮罩关闭
document.getElementById('deleteModal').addEventListener('click', (e) => {
  if (e.target.id === 'deleteModal') hideDeleteModal();
});

// ==================== Tab 3: 统计 ====================

// 月份切换
document.getElementById('btnStatsPrev').addEventListener('click', () => changeStatsMonth(-1));
document.getElementById('btnStatsNext').addEventListener('click', () => changeStatsMonth(1));

function changeStatsMonth(delta) {
  const [y, m] = statsMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  statsMonth = formatYearMonth(d);
  updateStatsHeader();
  refreshStatsPage();
}

function updateStatsHeader() {
  const [y, m] = statsMonth.split('-');
  document.getElementById('statsMonthLabel').textContent = `${y}年 ${m}月`;
}

// 刷新统计页
async function refreshStatsPage() {
  updateStatsHeader();
  await refreshBudgetBar();
  if (currentTab === 'stats') {
    await refreshCharts(statsMonth);
  }
}

// ==================== 预算 ====================

// 保存预算
document.getElementById('btnSaveBudget').addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('inputBudget').value);
  if (isNaN(amount) || amount <= 0) {
    showToast('请输入有效的预算金额');
    return;
  }

  const now = new Date();
  const ym = formatYearMonth(now);
  await setBudget(ym, amount);
  document.getElementById('inputBudget').value = '';
  showToast('预算已保存');
  await refreshBudgetBar();
});

// 渲染预算进度条
async function refreshBudgetBar() {
  const budget = await getBudget(statsMonth);
  const summary = await getMonthSummary(statsMonth);
  const spent = summary.expense;

  const budgetText = document.getElementById('budgetText');
  const budgetBar = document.getElementById('budgetBar');
  const budgetDetail = document.getElementById('budgetDetail');

  if (!budget || budget.amount <= 0) {
    budgetText.textContent = '未设置';
    budgetBar.style.width = '0%';
    budgetBar.className = 'budget-bar-fill safe';
    budgetDetail.textContent = '去"我的"页面设置月度预算';
    return;
  }

  const total = budget.amount;
  const pct = Math.min((spent / total) * 100, 100);
  const remaining = total - spent;

  budgetText.textContent = `¥${total.toFixed(0)}`;
  budgetBar.style.width = `${pct}%`;

  // 颜色状态
  budgetBar.className = 'budget-bar-fill';
  if (pct >= 90) {
    budgetBar.classList.add('danger');
  } else if (pct >= 70) {
    budgetBar.classList.add('warning');
  } else {
    budgetBar.classList.add('safe');
  }

  if (remaining >= 0) {
    budgetDetail.innerHTML = `已支出 <strong>¥${spent.toFixed(2)}</strong>，剩余 <strong style="color:var(--primary)">¥${remaining.toFixed(2)}</strong>`;
  } else {
    budgetDetail.innerHTML = `已支出 <strong>¥${spent.toFixed(2)}</strong>，超支 <strong style="color:var(--danger)">¥${Math.abs(remaining).toFixed(2)}</strong>`;
  }

  // 超支弹窗提醒
  if (remaining < 0 && currentTab === 'stats') {
    setTimeout(() => showToast('⚠️ 本月已超支！'), 500);
  }
}

// ==================== 导出/导入 ====================

document.getElementById('btnExport').addEventListener('click', exportToCSV);

document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // 确认导入（会覆盖现有数据）
  if (!confirm('导入将覆盖现有数据，确定继续吗？')) {
    e.target.value = '';
    return;
  }

  await importFromCSV(file);
  e.target.value = '';
  await refreshListPage();
  await refreshStatsPage();
});

// ==================== Toast ====================

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 1800);
}

// ==================== Service Worker ====================

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.log('SW registration failed:', err));
  }
}

// ==================== 启动应用 ====================

document.addEventListener('DOMContentLoaded', init);
