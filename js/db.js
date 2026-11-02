import { BACKUP_SCHEMA_VERSION, DB_NAME, DB_VERSION, DEFAULT_CATEGORIES } from './constants.js';
import { buildInstallmentRecords } from './finance.js';
import { uid } from './utils.js';

let dbPromise;
const requestResult = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const transactionDone = tx => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error('פעולת השמירה נכשלה')); tx.onabort = () => reject(tx.error || new Error('פעולת השמירה בוטלה')); });

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const db = request.result; const tx = request.transaction;
      if (!db.objectStoreNames.contains('categories')) {
        const categories = db.createObjectStore('categories', { keyPath: 'id' });
        categories.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains('transactions')) {
        const transactions = db.createObjectStore('transactions', { keyPath: 'id' });
        transactions.createIndex('date', 'date', { unique: false }); transactions.createIndex('type', 'type', { unique: false });
        transactions.createIndex('categoryId', 'categoryId', { unique: false }); transactions.createIndex('seriesId', 'seriesId', { unique: false });
      }
      if (!db.objectStoreNames.contains('installments')) db.createObjectStore('installments', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (event.oldVersion === 0) {
        const categoryStore = tx.objectStore('categories');
        DEFAULT_CATEGORIES.forEach((category, order) => categoryStore.put({ ...category, order, createdAt: new Date().toISOString() }));
        tx.objectStore('settings').put({ key: 'initialized', value: true });
      }
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('מסד הנתונים פתוח בלשונית אחרת. יש לסגור אותה ולנסות שוב.'));
  });
  return dbPromise;
}

async function getAll(storeName) { const db = await openDatabase(); return requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).getAll()); }
export const getCategories = () => getAll('categories');
export const getTransactions = () => getAll('transactions');
export const getInstallments = () => getAll('installments');

export async function getMonthlyTransactions(monthKey) {
  const all = await getTransactions();
  return all.filter(item => item.date.startsWith(monthKey)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function saveCategory(category) {
  const db = await openDatabase(); const tx = db.transaction('categories', 'readwrite');
  const store = tx.objectStore('categories'); const now = new Date().toISOString();
  const record = { ...category, id: category.id || uid('category'), createdAt: category.createdAt || now, updatedAt: now };
  store.put(record); await transactionDone(tx); return record;
}

export async function deleteCategoryAndReassign(categoryId, replacementId = null) {
  const db = await openDatabase();
  const tx = db.transaction(['categories', 'transactions', 'installments'], 'readwrite');
  const categories = tx.objectStore('categories'); const transactions = tx.objectStore('transactions'); const installments = tx.objectStore('installments');
  const category = await requestResult(categories.get(categoryId));
  if (!category) { tx.abort(); throw new Error('הקטגוריה לא נמצאה'); }
  const linked = await requestResult(transactions.index('categoryId').getAll(categoryId));
  const allPurchases = await requestResult(installments.getAll());
  const linkedPurchases = allPurchases.filter(item => item.categoryId === categoryId);
  if ((linked.length || linkedPurchases.length) && !replacementId) { tx.abort(); throw new Error('יש לבחור קטגוריה חלופית'); }
  if (replacementId) {
    const replacement = await requestResult(categories.get(replacementId));
    if (!replacement || replacement.type !== category.type || replacement.id === categoryId) { tx.abort(); throw new Error('הקטגוריה החלופית אינה תקינה'); }
    linked.forEach(item => transactions.put({ ...item, categoryId: replacementId, updatedAt: new Date().toISOString() }));
    linkedPurchases.forEach(item => installments.put({ ...item, categoryId: replacementId, updatedAt: new Date().toISOString() }));
  }
  categories.delete(categoryId); await transactionDone(tx); return linked.length;
}

export async function saveTransaction(data) {
  const db = await openDatabase(); const tx = db.transaction('transactions', 'readwrite'); const now = new Date().toISOString();
  const record = { ...data, id: data.id || uid('transaction'), seriesId: null, installmentNumber: null, totalInstallments: null, createdAt: data.createdAt || now, updatedAt: now };
  tx.objectStore('transactions').put(record); await transactionDone(tx); return record;
}

export async function deleteTransaction(id) {
  const db = await openDatabase(); const tx = db.transaction('transactions', 'readwrite'); tx.objectStore('transactions').delete(id); await transactionDone(tx);
}

export async function getInstallment(id) { const db = await openDatabase(); return requestResult(db.transaction('installments').objectStore('installments').get(id)); }

export async function saveInstallmentPurchase(purchase, existingId = null) {
  const built = buildInstallmentRecords(purchase, existingId); const db = await openDatabase();
  const tx = db.transaction(['transactions', 'installments'], 'readwrite'); const transactionStore = tx.objectStore('transactions');
  if (existingId) {
    const existing = await requestResult(transactionStore.index('seriesId').getAll(existingId)); existing.forEach(item => transactionStore.delete(item.id));
  }
  tx.objectStore('installments').put(built.master); built.transactions.forEach(item => transactionStore.put(item));
  await transactionDone(tx); return built.master;
}

export async function deleteInstallmentSeries(seriesId) {
  const db = await openDatabase(); const tx = db.transaction(['transactions', 'installments'], 'readwrite'); const store = tx.objectStore('transactions');
  const records = await requestResult(store.index('seriesId').getAll(seriesId)); records.forEach(item => store.delete(item.id)); tx.objectStore('installments').delete(seriesId); await transactionDone(tx);
}

export async function getCategoryUsage(categoryId) {
  const db = await openDatabase(); return requestResult(db.transaction('transactions').objectStore('transactions').index('categoryId').count(categoryId));
}

export async function exportBackup() {
  const [categories, transactions, installments, settings] = await Promise.all([getAll('categories'), getAll('transactions'), getAll('installments'), getAll('settings')]);
  return { app: 'my-money-he', schemaVersion: BACKUP_SCHEMA_VERSION, createdAt: new Date().toISOString(), categories, transactions, installments, settings };
}

export function validateBackup(data) {
  if (!data || data.app !== 'my-money-he' || data.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error('זה אינו קובץ גיבוי נתמך של האפליקציה');
  for (const key of ['categories', 'transactions', 'installments', 'settings']) if (!Array.isArray(data[key])) throw new Error(`בגיבוי חסר המידע: ${key}`);
  const uniqueIds = (items, label) => { const ids = new Set(); items.forEach(item => { if (!item?.id || ids.has(item.id)) throw new Error(`נמצאו מזהים חסרים או כפולים ב-${label}`); ids.add(item.id); }); return ids; };
  const categoryIds = uniqueIds(data.categories, 'קטגוריות'); const transactionIds = uniqueIds(data.transactions, 'תנועות'); const purchaseIds = uniqueIds(data.installments, 'תשלומים');
  if (transactionIds.size > 250000) throw new Error('קובץ הגיבוי גדול מדי');
  data.categories.forEach(c => { if (!['income', 'expense'].includes(c.type) || !String(c.name || '').trim()) throw new Error('נמצאה קטגוריה פגומה'); });
  data.transactions.forEach(t => {
    if (!['income', 'expense'].includes(t.type) || !categoryIds.has(t.categoryId) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !Number.isSafeInteger(t.amountMinor) || !Number.isSafeInteger(t.ilsMinor) || t.amountMinor <= 0 || t.ilsMinor <= 0) throw new Error('נמצאה תנועה פגומה או קטגוריה חסרה');
    if (t.seriesId && !purchaseIds.has(t.seriesId)) throw new Error('נמצא תשלום ללא רכישה מקושרת');
  });
  data.installments.forEach(p => {
    const payments = data.transactions.filter(t => t.seriesId === p.id);
    if (!categoryIds.has(p.categoryId) || !Number.isInteger(p.payments) || p.payments < 2 || payments.length !== p.payments || payments.reduce((sum, t) => sum + t.ilsMinor, 0) !== p.totalIlsMinor) throw new Error('נמצאה סדרת תשלומים פגומה');
  });
  return true;
}

export async function restoreBackup(data) {
  validateBackup(data); const db = await openDatabase(); const names = ['categories', 'transactions', 'installments', 'settings']; const tx = db.transaction(names, 'readwrite');
  names.forEach(name => tx.objectStore(name).clear());
  data.categories.forEach(item => tx.objectStore('categories').put(item)); data.transactions.forEach(item => tx.objectStore('transactions').put(item));
  data.installments.forEach(item => tx.objectStore('installments').put(item)); data.settings.forEach(item => tx.objectStore('settings').put(item));
  await transactionDone(tx);
}

export async function resetAllData() {
  const db = await openDatabase(); const names = ['categories', 'transactions', 'installments', 'settings']; const tx = db.transaction(names, 'readwrite');
  names.forEach(name => tx.objectStore(name).clear());
  DEFAULT_CATEGORIES.forEach((category, order) => tx.objectStore('categories').put({ ...category, order, createdAt: new Date().toISOString() }));
  tx.objectStore('settings').put({ key: 'initialized', value: true }); await transactionDone(tx);
}
