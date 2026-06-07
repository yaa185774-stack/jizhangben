/**
 * 数据导入导出模块
 * 支持 CSV 格式的导出和导入
 */

/**
 * 将交易记录导出为 CSV 文件并下载
 */
async function exportToCSV() {
  const data = await exportAllData();
  const transactions = data.transactions;

  if (transactions.length === 0) {
    showToast('没有数据可以导出');
    return;
  }

  // CSV 表头
  const headers = ['类型', '金额', '分类', '日期', '备注'];
  const rows = transactions.map(t => [
    t.type === 'income' ? '收入' : '支出',
    t.amount,
    t.category,
    t.date,
    t.note || ''
  ]);

  // 生成 CSV 内容（添加 BOM 头以支持 Excel 中文）
  let csv = '﻿';
  csv += headers.join(',') + '\n';
  csv += rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

  // 下载文件
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `记账数据_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`已导出 ${transactions.length} 条记录`);
}

/**
 * 从 CSV 文件导入数据
 * @param {File} file - CSV 文件
 */
async function importFromCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
          showToast('CSV 文件为空或格式不正确');
          resolve(0);
          return;
        }

        // 跳过表头，解析数据行
        const records = [];
        for (let i = 1; i < lines.length; i++) {
          const cells = parseCSVLine(lines[i]);
          if (cells.length < 4) continue;

          // 格式: 类型, 金额, 分类, 日期, 备注
          const type = cells[0].trim() === '收入' ? 'income' : 'expense';
          const amount = parseFloat(cells[1]) || 0;
          const category = cells[2].trim();
          const date = cells[3].trim();
          const note = cells.length > 4 ? cells[4].trim() : '';

          if (amount > 0 && date) {
            records.push({ type, amount, category, date, note });
          }
        }

        if (records.length > 0) {
          await importAllData({ transactions: records, budgets: [] });
          showToast(`成功导入 ${records.length} 条记录`);
        } else {
          showToast('没有识别到有效数据');
        }

        resolve(records.length);
      } catch (err) {
        console.error('导入失败:', err);
        showToast('导入失败，请检查文件格式');
        reject(err);
      }
    };

    reader.onerror = () => {
      showToast('文件读取失败');
      reject(reader.error);
    };

    reader.readAsText(file);
  });
}

/**
 * 解析 CSV 行（处理引号内的逗号）
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
