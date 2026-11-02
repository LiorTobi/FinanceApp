import { addMonthsClamped, splitMinor, uid } from './utils.js';

export function buildInstallmentRecords(purchase, existingId = null) {
  const id = existingId || uid('purchase');
  const now = new Date().toISOString();
  const originalParts = splitMinor(purchase.totalOriginalMinor, purchase.payments);
  const ilsParts = purchase.currency === 'ILS' ? originalParts : splitMinor(purchase.totalIlsMinor, purchase.payments);
  const master = {
    id, totalOriginalMinor: purchase.totalOriginalMinor, totalIlsMinor: purchase.currency === 'ILS' ? purchase.totalOriginalMinor : purchase.totalIlsMinor,
    currency: purchase.currency, payments: purchase.payments, firstDate: purchase.firstDate, categoryId: purchase.categoryId,
    title: purchase.title, description: purchase.description || '', createdAt: purchase.createdAt || now, updatedAt: now
  };
  const transactions = originalParts.map((amountMinor, index) => ({
    id: `${id}-payment-${index + 1}`, type: 'expense', amountMinor, currency: purchase.currency, ilsMinor: ilsParts[index],
    date: addMonthsClamped(purchase.firstDate, index), categoryId: purchase.categoryId, title: purchase.title,
    description: purchase.description || '', seriesId: id, installmentNumber: index + 1, totalInstallments: purchase.payments,
    createdAt: purchase.createdAt || now, updatedAt: now
  }));
  return { master, transactions };
}

export function monthlySummary(transactions) {
  return transactions.reduce((sum, item) => {
    if (item.type === 'income') sum.income += item.ilsMinor;
    else sum.expense += item.ilsMinor;
    sum.balance = sum.income - sum.expense;
    return sum;
  }, { income: 0, expense: 0, balance: 0 });
}

export function yearlyData(transactions, year) {
  const months = Array.from({ length: 12 }, () => ({ income: 0, expense: 0, balance: 0 }));
  transactions.filter(t => Number(t.date.slice(0, 4)) === Number(year)).forEach(t => {
    const index = Number(t.date.slice(5, 7)) - 1;
    if (t.type === 'income') months[index].income += t.ilsMinor; else months[index].expense += t.ilsMinor;
    months[index].balance = months[index].income - months[index].expense;
  });
  const income = months.reduce((a, m) => a + m.income, 0);
  const expense = months.reduce((a, m) => a + m.expense, 0);
  const expenseValues = months.map(m => m.expense);
  return {
    months, income, expense, balance: income - expense, averageIncome: Math.round(income / 12), averageExpense: Math.round(expense / 12),
    highestExpenseMonth: expenseValues.indexOf(Math.max(...expenseValues)), lowestExpenseMonth: expenseValues.indexOf(Math.min(...expenseValues))
  };
}

export function categoryExpenseData(transactions, categories) {
  const map = new Map();
  transactions.filter(t => t.type === 'expense').forEach(t => map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.ilsMinor));
  return [...map].map(([categoryId, value]) => ({ categoryId, value, category: categories.find(c => c.id === categoryId) || { name: 'קטגוריה לא ידועה', emoji: '❓' } })).sort((a, b) => b.value - a.value);
}
