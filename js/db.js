/**
 * IndexedDB 数据库操作层
 * 管理 transactions（收支记录）和 budgets（预算）两个表
 */

const DB_NAME = 'JizhangBenDB';
const DB_VERSION = 1;

let db = null;

/**
 * 打开数据库（如果不存在则创建）
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // 创建 transactions 表
      if (!database.objectStoreNames.contains('transactions')) {
        const txStore = database.createObjectStore('transactions', {
          keyPath: 'id',
          autoIncrement: true
        });
        txStore.createIndex('date', 'date', { unique: false });
        txStore.createIndex('type', 'type', { unique: false });
        txStore.createIndex('category', 'category', { unique: false });
      }

      // 创建 budgets 表
      if (!database.objectStoreNames.contains('budgets')) {
        const budgetStore = database.createObjectStore('budgets', {
          keyPath: 'id',
          autoIncrement: true
        });
        budgetStore.createIndex('month', 'month', { unique: true });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('数据库打开失败:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * 确保数据库已打开
 */
async function ensureDB() {
  if (db) return db;
  return openDB();
}

// ==================== 交易记录 CRUD ====================

/**
 * 添加一条交易记录
 */
async function addTransaction(record) {
  const database = await ensureDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    const data = {
      ...record,
      createdAt: Date.now()
    };
    const request = store.add(data);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 根据 ID 获取单条记录
 */
async function getTransaction(id) {
  const database = await ensureDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('transactions', 'readonly');
    const store = tx.objectStore('transactions');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取所有记录，按日期倒序
 */
async function getAllTransactions() {
  const database = await ensureDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('transactions', 'readonly');
    const store = tx.objectStore('transactions');
    const request = store.getAll();

    request.onsuccess = () => {
      const records = request.result || [];
      // 按日期倒序、创建时间倒序排列
      records.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.createdAt - a.createdAt;
      });
      resolve(records);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取指定月份的记录
 * @param {string} yearMonth - 格式 "YYYY-MM"
 */
async function getTransactionsByMonth(yearMonth) {
  const all = await getAllTransactions();
  return all.filter(t => t.date.startsWith(yearMonth));
}

/**
 * 获取指定月份 + 指定类型的记录
 */
async function getTransactionsByMonthAndType(yearMonth, type) {
  const monthRecords = await getTransactionsByMonth(yearMonth);
  if (type === 'all') return monthRecords;
  return monthRecords.filter(t => t.type === type);
}

/**
 * 删除一条记录
 */
async function deleteTransaction(id) {
  const database = await ensureDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取某月收支汇总
 * @returns {{ income: number, expense: number }}
 */
async function getMonthSummary(yearMonth) {
  const records = await getTransactionsByMonth(yearMonth);
  let income = 0, expense = 0;
  records.forEach(r => {
    const amt = parseFloat(r.amount) || 0;
    if (r.type === 'income') income += amt;
    else expense += amt;
  });
  return { income: Math.round(income * 100) / 100, expense: Math.round(expense * 100) / 100 };
}

/**
 * 获取某月支出分类汇总
 * @returns {Array<{category: string, total: number}>}
 */
async function getCategorySummary(yearMonth) {
  const records = await getTransactionsByMonth(yearMonth);
  const expenseMap = {};
  records.filter(r => r.type === 'expense').forEach(r => {
    const cat = r.category || '其他';
    expenseMap[cat] = (expenseMap[cat] || 0) + (parseFloat(r.amount) || 0);
  });
  return Object.entries(expenseMap)
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

/**
 * 获取近N个月的收支汇总（用于趋势图）
 * @param {number} months - 月数
 */
async function getMonthlyTrend(months = 6) {
  const now = new Date();
  const result = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const summary = await getMonthSummary(ym);
    result.push({
      month: ym,
      label: `${d.getMonth() + 1}月`,
      income: summary.income,
      expense: summary.expense
    });
  }

  return result;
}

// ==================== 预算 CRUD ====================

/**
 * 设置/更新月度预算
 */
async function setBudget(yearMonth, amount) {
  const database = await ensureDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('budgets', 'readwrite');
    const store = tx.objectStore('budgets');
    const index = store.index('month');

    // 先查是否已有该月预算
    const getRequest = index.get(yearMonth);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (existing) {
        // 更新
        existing.amount = parseFloat(amount);
        existing.updatedAt = Date.now();
        store.put(existing).onsuccess = () => resolve(existing);
      } else {
        // 新增
        const data = { month: yearMonth, amount: parseFloat(amount), createdAt: Date.now() };
        store.add(data).onsuccess = (e) => resolve(e.target.result);
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * 获取某月预算
 */
async function getBudget(yearMonth) {
  const database = await ensureDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('budgets', 'readonly');
    const store = tx.objectStore('budgets');
    const index = store.index('month');
    const request = index.get(yearMonth);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取所有预算
 */
async function getAllBudgets() {
  const database = await ensureDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('budgets', 'readonly');
    const store = tx.objectStore('budgets');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除某月预算
 */
async function deleteBudget(yearMonth) {
  const database = await ensureDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('budgets', 'readwrite');
    const store = tx.objectStore('budgets');
    const index = store.index('month');
    const getRequest = index.get(yearMonth);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (existing) {
        store.delete(existing.id).onsuccess = () => resolve(true);
      } else {
        resolve(false);
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// ==================== 数据导入导出 ====================

/**
 * 导出所有数据为 JSON 对象
 */
async function exportAllData() {
  const transactions = await getAllTransactions();
  const budgets = await getAllBudgets();
  return { transactions, budgets, exportTime: new Date().toISOString() };
}

/**
 * 导入数据
 */
async function importAllData(data) {
  const database = await ensureDB();

  // 清空现有数据
  await clearAllData();

  // 导入 transactions
  if (data.transactions && data.transactions.length > 0) {
    for (const record of data.transactions) {
      await new Promise((resolve, reject) => {
        const tx = database.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        // 保留原始 id 和 createdAt
        const { id, ...rest } = record;
        const clean = {
          ...rest,
          createdAt: record.createdAt || Date.now()
        };
        const request = store.add(clean);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }

  // 导入 budgets
  if (data.budgets && data.budgets.length > 0) {
    for (const budget of data.budgets) {
      await new Promise((resolve, reject) => {
        const tx = database.transaction('budgets', 'readwrite');
        const store = tx.objectStore('budgets');
        const { id, ...rest } = budget;
        store.add(rest).onsuccess = () => resolve();
        store.add(rest).onerror = () => reject();
      });
    }
  }
}

/**
 * 清空所有数据
 */
async function clearAllData() {
  const database = await ensureDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['transactions', 'budgets'], 'readwrite');
    tx.objectStore('transactions').clear();
    tx.objectStore('budgets').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
