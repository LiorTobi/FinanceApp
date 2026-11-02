import { APP_VERSION, CURRENCIES, MONTHS_HE } from './constants.js';
import * as db from './db.js';
import { categoryExpenseData, monthlySummary, yearlyData } from './finance.js';
import { renderBalanceChart, renderComparisonChart, renderDonut } from './charts.js?v=1.0.6';
import { dateMonthKey, debounce, downloadJson, escapeHtml, formatDate, formatMoney, minorToInput, monthKey, readJsonFile, toMinor, todayISO } from './utils.js';

const state = {
  year: new Date().getFullYear(), month: new Date().getMonth(), reportYear: new Date().getFullYear(),
  categories: [], transactions: [], monthly: [], installments: [], showAll: false
};

const $ = selector => document.querySelector(selector);
const modalRoot = $('#modalRoot');

function toast(message, type = 'success') {
  const item = document.createElement('div'); item.className = `toast ${type === 'error' ? 'error' : ''}`; item.textContent = message;
  $('#toastRegion').append(item); setTimeout(() => item.remove(), 3300);
}

function openModal({ title, eyebrow = '', html = '', wide = false, onOpen }) {
  const fragment = $('#modalTemplate').content.cloneNode(true); const backdrop = fragment.querySelector('.modal-backdrop');
  fragment.querySelector('.modal-title').textContent = title; fragment.querySelector('.modal-eyebrow').textContent = eyebrow;
  fragment.querySelector('.modal-body').innerHTML = html; if (wide) fragment.querySelector('.modal').classList.add('wide');
  modalRoot.replaceChildren(fragment); document.body.style.overflow = 'hidden';
  const close = () => closeModal();
  modalRoot.querySelector('.close-modal').addEventListener('click', close);
  modalRoot.querySelector('.modal-backdrop').addEventListener('click', event => { if (event.target === backdrop || event.target.hasAttribute('data-close-modal')) close(); });
  document.addEventListener('keydown', escapeModal, { once: true });
  onOpen?.(modalRoot.querySelector('.modal'));
}

function escapeModal(event) { if (event.key === 'Escape') closeModal(); else document.addEventListener('keydown', escapeModal, { once: true }); }
function closeModal() { modalRoot.replaceChildren(); document.body.style.overflow = ''; }

function categoryById(id) { return state.categories.find(category => category.id === id) || { name: 'קטגוריה לא ידועה', emoji: '❓' }; }
function categoryOptions(type, selected = '') {
  return state.categories.filter(c => c.type === type).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, 'he')).map(c => `<option value="${escapeHtml(c.id)}" ${c.id === selected ? 'selected' : ''}>${escapeHtml(c.emoji)} ${escapeHtml(c.name)}</option>`).join('');
}
function currencyOptions(selected = 'ILS') { return CURRENCIES.map(([code, name]) => `<option value="${code}" ${code === selected ? 'selected' : ''}>${name} · ${code}</option>`).join(''); }
function moneyHtml(minor, currency = 'ILS', options = {}, extraClass = '') { return `<span class="money-value${extraClass ? ` ${extraClass}` : ''}" dir="ltr">${escapeHtml(formatMoney(minor, currency, options))}</span>`; }
function numberHtml(value) { return `<span class="number-value" dir="ltr">${escapeHtml(value)}</span>`; }
function monthAndMoneyHtml(monthIndex, amountMinor) {
  return `<span class="report-month" dir="rtl">${escapeHtml(MONTHS_HE[monthIndex])}</span><span class="report-separator" aria-hidden="true">&nbsp;·&nbsp;</span>${moneyHtml(amountMinor, 'ILS', {}, 'report-amount')}`;
}

async function refreshData() {
  [state.categories, state.transactions, state.installments] = await Promise.all([db.getCategories(), db.getTransactions(), db.getInstallments()]);
  state.monthly = state.transactions.filter(t => dateMonthKey(t.date) === monthKey(state.year, state.month)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  renderDashboard();
}

function renderDashboard() {
  const summary = monthlySummary(state.monthly);
  $('#monthTitle').innerHTML = `${escapeHtml(MONTHS_HE[state.month])} ${numberHtml(state.year)}`;
  $('#incomeCard').setAttribute('aria-label', `הצגת כל ההכנסות ב${MONTHS_HE[state.month]} ${state.year}`);
  $('#expenseCard').setAttribute('aria-label', `הצגת כל ההוצאות ב${MONTHS_HE[state.month]} ${state.year}`);
  $('#incomeTotal').textContent = formatMoney(summary.income); $('#expenseTotal').textContent = formatMoney(summary.expense); $('#balanceTotal').textContent = formatMoney(summary.balance);
  $('#balanceTotal').style.color = summary.balance < 0 ? '#d64c4c' : '#108a5b';
  $('#donutTotal').textContent = formatMoney(summary.expense);
  renderDonut($('#expenseDonut'), $('#donutLegend'), categoryExpenseData(state.monthly, state.categories));
  renderTransactions(); renderYearSelector(); renderReports();
}

function renderTransactions() {
  const list = $('#transactionsList'); list.replaceChildren(); const items = state.showAll ? state.monthly : state.monthly.slice(0, 6);
  if (!items.length) { list.innerHTML = '<div class="empty-state"><span>🧾</span><strong>החודש עדיין ריק</strong><br>התנועה הראשונה שלך תופיע כאן</div>'; $('#showAllTransactions').classList.add('hidden'); return; }
  items.forEach(item => {
    const category = categoryById(item.categoryId); const button = document.createElement('button'); button.className = 'transaction-item'; button.dataset.id = item.id;
    const installment = item.seriesId ? ` · תשלום ${numberHtml(item.installmentNumber)} מתוך ${numberHtml(item.totalInstallments)}` : '';
    const original = item.currency !== 'ILS' ? `<small>${moneyHtml(item.amountMinor, item.currency)}</small>` : '';
    button.innerHTML = `<span class="transaction-emoji">${escapeHtml(category.emoji)}</span><span class="transaction-main"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(category.name)} · ${numberHtml(formatDate(item.date))}${installment}</span></span><span class="transaction-amount ${item.type}">${item.type === 'income' ? '+' : '−'}${moneyHtml(item.ilsMinor)}${original}</span>`;
    button.addEventListener('click', () => showTransactionDetails(item.id)); list.append(button);
  });
  $('#showAllTransactions').classList.toggle('hidden', state.monthly.length <= 6);
  $('#showAllTransactions').innerHTML = state.showAll ? 'הצגת תנועות אחרונות בלבד' : `הצגת כל ${numberHtml(state.monthly.length)} התנועות בחודש`;
}

function openMonthlyTransactions(type) {
  const items = state.monthly.filter(item => item.type === type);
  const total = items.reduce((sum, item) => sum + item.ilsMinor, 0);
  const typeLabel = type === 'income' ? 'הכנסות' : 'הוצאות';
  const monthLabel = `${MONTHS_HE[state.month]} ${state.year}`;
  const emptyIcon = type === 'income' ? '↙' : '↗';
  openModal({
    title: `${typeLabel} · ${monthLabel}`,
    eyebrow: 'פירוט חודשי',
    wide: true,
    html: `<div class="modal-list-summary"><div class="modal-list-stat"><span>מספר תנועות</span><strong>${numberHtml(items.length)}</strong></div><div class="modal-list-stat"><span>סכום כולל</span><strong>${moneyHtml(total)}</strong></div></div><div class="transaction-list modal-transaction-list" id="monthlyTypeList"></div>`,
    onOpen: modal => {
      modal.classList.add('transaction-list-modal');
      const list = modal.querySelector('#monthlyTypeList');
      if (!items.length) {
        list.innerHTML = `<div class="empty-state"><span>${emptyIcon}</span><strong>אין ${typeLabel} בחודש הזה</strong><br>תנועות חדשות יופיעו כאן</div>`;
        return;
      }
      items.forEach(item => {
        const category = categoryById(item.categoryId);
        const button = document.createElement('button');
        button.className = 'transaction-item';
        button.dataset.id = item.id;
        const installment = item.seriesId ? ` · תשלום ${numberHtml(item.installmentNumber)} מתוך ${numberHtml(item.totalInstallments)}` : '';
        const original = item.currency !== 'ILS' ? `<small>${moneyHtml(item.amountMinor, item.currency)}</small>` : '';
        button.innerHTML = `<span class="transaction-emoji">${escapeHtml(category.emoji)}</span><span class="transaction-main"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(category.name)} · ${numberHtml(formatDate(item.date))}${installment}</span></span><span class="transaction-amount ${item.type}">${item.type === 'income' ? '+' : '−'}${moneyHtml(item.ilsMinor)}${original}</span>`;
        button.addEventListener('click', () => showTransactionDetails(item.id));
        list.append(button);
      });
    }
  });
}

function renderYearSelector() {
  const years = new Set([new Date().getFullYear(), state.year, state.reportYear, ...state.transactions.map(t => Number(t.date.slice(0, 4)))]);
  const sorted = [...years].filter(Boolean).sort((a, b) => b - a); $('#reportYear').innerHTML = sorted.map(y => `<option value="${y}" ${y === state.reportYear ? 'selected' : ''}>${y}</option>`).join('');
}

function renderReports() {
  const report = yearlyData(state.transactions, state.reportYear); const expenseData = categoryExpenseData(state.transactions.filter(t => Number(t.date.slice(0, 4)) === state.reportYear), state.categories);
  $('#annualSummary').innerHTML = [
    ['סך הכנסות', moneyHtml(report.income), 'money-value'], ['סך הוצאות', moneyHtml(report.expense), 'money-value'], ['מאזן שנתי', moneyHtml(report.balance), 'money-value'],
    ['ממוצע הכנסות חודשי (מתוך 12)', moneyHtml(report.averageIncome), 'money-value'], ['ממוצע הוצאות חודשי (מתוך 12)', moneyHtml(report.averageExpense), 'money-value'],
    ['חודש עם ההוצאה הגבוהה', monthAndMoneyHtml(report.highestExpenseMonth, report.months[report.highestExpenseMonth].expense), 'mixed-value'],
    ['חודש עם ההוצאה הנמוכה', monthAndMoneyHtml(report.lowestExpenseMonth, report.months[report.lowestExpenseMonth].expense), 'mixed-value']
  ].map(([label, value, className]) => `<div class="metric"><span>${label}</span><strong class="${className}">${value}</strong></div>`).join('');
  renderComparisonChart($('#comparisonChart'), report.months); renderBalanceChart($('#balanceChart'), report.months);
  const total = expenseData.reduce((sum, item) => sum + item.value, 0); $('#topCategories').innerHTML = expenseData.length ? expenseData.slice(0, 6).map((item, index) => {
    const percent = total ? Math.round(item.value / total * 100) : 0;
    return `<div class="category-rank"><span class="rank-icon">${escapeHtml(item.category.emoji)}</span><div><strong>${numberHtml(`${index + 1}.`)} ${escapeHtml(item.category.name)}</strong><div class="rank-bar"><i style="width:${percent}%"></i></div></div><strong>${moneyHtml(item.value)} · ${numberHtml(`${percent}%`)}</strong></div>`;
  }).join('') : '<div class="empty-state">אין הוצאות בשנה זו</div>';
}

function moveMonth(delta) {
  const date = new Date(state.year, state.month + delta, 1); state.year = date.getFullYear(); state.month = date.getMonth(); state.showAll = false; refreshData().catch(handleError);
}

function showMonthPicker() {
  const currentYear = new Date().getFullYear(); const years = Array.from({ length: 41 }, (_, i) => currentYear + 10 - i);
  openModal({ title: 'בחירת חודש', eyebrow: 'מעבר מהיר', html: `<form id="monthPickerForm"><div class="month-picker-grid"><div class="field"><label for="pickMonth">חודש</label><select id="pickMonth">${MONTHS_HE.map((m, i) => `<option value="${i}" ${i === state.month ? 'selected' : ''}>${m}</option>`).join('')}</select></div><div class="field"><label for="pickYear">שנה</label><select id="pickYear">${years.map(y => `<option ${y === state.year ? 'selected' : ''}>${y}</option>`).join('')}</select></div></div><div class="form-actions"><button class="primary-button" type="submit">מעבר לחודש</button></div></form>`, onOpen: modal => modal.querySelector('form').addEventListener('submit', event => { event.preventDefault(); state.month = Number($('#pickMonth').value); state.year = Number($('#pickYear').value); state.showAll = false; closeModal(); refreshData().catch(handleError); }) });
}

function transactionFormHtml(existing = null, purchase = null) {
  const isSeries = Boolean(purchase); const type = purchase ? 'expense' : (existing?.type || 'expense'); const currency = purchase?.currency || existing?.currency || 'ILS';
  const amount = purchase?.totalOriginalMinor ?? existing?.amountMinor; const ils = purchase?.totalIlsMinor ?? existing?.ilsMinor;
  return `<form id="transactionForm" novalidate>
    <div class="form-grid">
      <div class="field full"><span>סוג תנועה</span><div class="segmented"><label><input type="radio" name="type" value="expense" ${type === 'expense' ? 'checked' : ''} ${isSeries ? 'disabled' : ''}><span>הוצאה</span></label><label><input type="radio" name="type" value="income" ${type === 'income' ? 'checked' : ''} ${isSeries ? 'disabled' : ''}><span>הכנסה</span></label></div></div>
      <div class="field full" id="paymentModeField"><span>אופן התשלום</span><div class="segmented"><label><input type="radio" name="paymentMode" value="single" ${!isSeries ? 'checked' : ''} ${existing ? 'disabled' : ''}><span>תשלום רגיל</span></label><label><input type="radio" name="paymentMode" value="installments" ${isSeries ? 'checked' : ''} ${existing ? 'disabled' : ''}><span>רכישה בתשלומים</span></label></div></div>
      <div class="field"><label for="amount">${isSeries ? 'סכום כולל' : 'סכום'}</label><input id="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${amount ? minorToInput(amount) : ''}" required></div>
      <div class="field"><label for="currency">מטבע</label><select id="currency">${currencyOptions(currency)}</select></div>
      <div class="field full ${currency === 'ILS' ? 'hidden' : ''}" id="ilsValueField"><label for="ilsValue">שווי כולל בשקלים (הזנה ידנית)</label><input id="ilsValue" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${currency !== 'ILS' && ils ? minorToInput(ils) : ''}"><small>לא מתבצעת המרת מטבע אוטומטית.</small></div>
      <div class="field ${isSeries ? '' : 'hidden'}" id="paymentsField"><label for="payments">מספר תשלומים</label><input id="payments" type="number" inputmode="numeric" min="2" max="120" value="${purchase?.payments || 2}"></div>
      <div class="field"><label for="transactionDate" id="dateLabel">${isSeries ? 'תאריך התשלום הראשון' : 'תאריך'}</label><input id="transactionDate" type="date" value="${purchase?.firstDate || existing?.date || todayISO()}" required></div>
      <div class="field full"><label for="transactionCategory">קטגוריה</label><div class="inline-action"><div class="field"><select id="transactionCategory">${categoryOptions(type, purchase?.categoryId || existing?.categoryId)}</select></div><button type="button" class="secondary-button" id="quickAddCategory">＋ חדשה</button></div></div>
      <div id="quickCategoryFields" class="field full hidden"><div class="inline-action"><div class="field"><label for="quickCategoryName">שם קטגוריה חדשה</label><input id="quickCategoryName" maxlength="50"></div><div class="field"><label for="quickCategoryEmoji">אימוג׳י</label><input id="quickCategoryEmoji" maxlength="12" placeholder="✨"></div><button type="button" class="primary-button" id="saveQuickCategory">שמירה</button></div></div>
      <div class="field full"><label for="transactionTitle">${type === 'income' ? 'מקור ההכנסה' : 'שם העסק'}</label><input id="transactionTitle" maxlength="100" value="${escapeHtml(purchase?.title || existing?.title || '')}" required></div>
      <div class="field full"><label for="transactionDescription">תיאור (אופציונלי)</label><textarea id="transactionDescription" maxlength="500">${escapeHtml(purchase?.description || existing?.description || '')}</textarea></div>
      <div class="form-note full hidden" id="installmentNote">התשלומים יחולקו באגורות שלמות. אם הסכום אינו מתחלק שווה בשווה, ההפרש יתווסף לתשלום האחרון.</div>
    </div>
    <p class="form-error" id="transactionError" role="alert"></p>
    <div class="form-actions"><button type="button" class="secondary-button close-form">ביטול</button><button type="submit" class="primary-button" id="saveTransaction">${existing || purchase ? 'שמירת שינויים' : 'שמירת תנועה'}</button></div>
  </form>`;
}

function openTransactionForm(existing = null, purchase = null) {
  openModal({ title: purchase ? 'עריכת רכישה בתשלומים' : existing ? 'עריכת תנועה' : 'תנועה חדשה', eyebrow: existing || purchase ? 'עדכון פרטים' : 'הוספה מהירה', html: transactionFormHtml(existing, purchase), onOpen: modal => {
    const form = modal.querySelector('#transactionForm'); const typeInputs = [...form.querySelectorAll('input[name="type"]')]; const paymentInputs = [...form.querySelectorAll('input[name="paymentMode"]')];
    const selectedType = () => form.querySelector('input[name="type"]:checked')?.value || 'expense'; const selectedMode = () => form.querySelector('input[name="paymentMode"]:checked')?.value || 'single';
    const syncForm = () => {
      const type = selectedType(); const installments = type === 'expense' && selectedMode() === 'installments';
      $('#paymentModeField').classList.toggle('hidden', type !== 'expense'); $('#paymentsField').classList.toggle('hidden', !installments); $('#installmentNote').classList.toggle('hidden', !installments);
      $('#dateLabel').textContent = installments ? 'תאריך התשלום הראשון' : 'תאריך';
      $('#transactionCategory').innerHTML = categoryOptions(type, $('#transactionCategory').value);
      $('#transactionTitle').previousElementSibling.textContent = type === 'income' ? 'מקור ההכנסה' : 'שם העסק';
    };
    typeInputs.forEach(input => input.addEventListener('change', syncForm)); paymentInputs.forEach(input => input.addEventListener('change', syncForm)); syncForm();
    $('#currency').addEventListener('change', () => $('#ilsValueField').classList.toggle('hidden', $('#currency').value === 'ILS'));
    $('#quickAddCategory').addEventListener('click', () => $('#quickCategoryFields').classList.toggle('hidden'));
    $('#saveQuickCategory').addEventListener('click', async () => {
      try {
        const name = $('#quickCategoryName').value.trim(); const emoji = $('#quickCategoryEmoji').value.trim(); if (!name || !emoji) throw new Error('יש להזין שם ואימוג׳י');
        const category = await db.saveCategory({ name, emoji, type: selectedType(), order: 999 }); state.categories = await db.getCategories();
        $('#transactionCategory').innerHTML = categoryOptions(selectedType(), category.id); $('#quickCategoryFields').classList.add('hidden'); toast('הקטגוריה נוספה ונבחרה');
      } catch (error) { $('#transactionError').textContent = error.message; }
    });
    form.querySelector('.close-form').addEventListener('click', closeModal);
    form.addEventListener('submit', async event => {
      event.preventDefault(); const button = $('#saveTransaction'); if (button.disabled) return; button.disabled = true; $('#transactionError').textContent = '';
      try {
        const type = selectedType(); const mode = type === 'expense' ? selectedMode() : 'single'; const currency = $('#currency').value;
        const amountMinor = toMinor($('#amount').value); const ilsMinor = currency === 'ILS' ? amountMinor : toMinor($('#ilsValue').value);
        const common = { currency, categoryId: $('#transactionCategory').value, title: $('#transactionTitle').value.trim(), description: $('#transactionDescription').value.trim() };
        if (!common.categoryId) throw new Error('יש לבחור קטגוריה'); if (!common.title) throw new Error(type === 'income' ? 'יש להזין מקור הכנסה' : 'יש להזין שם עסק');
        if (mode === 'installments') {
          const payments = Number($('#payments').value); if (!Number.isInteger(payments) || payments < 2 || payments > 120) throw new Error('מספר התשלומים חייב להיות בין 2 ל־120');
          await db.saveInstallmentPurchase({ ...common, totalOriginalMinor: amountMinor, totalIlsMinor: ilsMinor, payments, firstDate: $('#transactionDate').value, createdAt: purchase?.createdAt }, purchase?.id || null);
        } else {
          await db.saveTransaction({ ...common, id: existing?.id, type, amountMinor, ilsMinor, date: $('#transactionDate').value, createdAt: existing?.createdAt });
        }
        closeModal(); await refreshData(); toast(existing || purchase ? 'השינויים נשמרו' : mode === 'installments' ? 'סדרת התשלומים נוצרה' : 'התנועה נשמרה');
      } catch (error) { $('#transactionError').textContent = error.message; button.disabled = false; }
    });
  } });
}

function showTransactionDetails(id) {
  const item = state.transactions.find(t => t.id === id); if (!item) return; const category = categoryById(item.categoryId);
  const original = item.currency !== 'ILS' ? `<div class="detail-row"><span>סכום מקורי</span><strong class="ltr">${formatMoney(item.amountMinor, item.currency, { alwaysDecimals: true })}</strong></div>` : '';
  const installment = item.seriesId ? `<div class="detail-row"><span>תשלום</span><strong>${item.installmentNumber} מתוך ${item.totalInstallments}</strong></div>` : '';
  openModal({ title: item.title, eyebrow: item.type === 'income' ? 'פרטי הכנסה' : 'פרטי הוצאה', html: `<div class="transaction-details"><div class="detail-row"><span>סכום בשקלים</span><strong class="ltr">${formatMoney(item.ilsMinor, 'ILS', { alwaysDecimals: true })}</strong></div>${original}<div class="detail-row"><span>קטגוריה</span><strong>${escapeHtml(category.emoji)} ${escapeHtml(category.name)}</strong></div><div class="detail-row"><span>תאריך</span><strong>${formatDate(item.date)}</strong></div>${installment}${item.description ? `<div class="detail-row"><span>תיאור</span><strong>${escapeHtml(item.description)}</strong></div>` : ''}</div><div class="form-actions"><button class="danger-button" id="deleteTransaction">${item.seriesId ? 'מחיקת כל הסדרה' : 'מחיקה'}</button><button class="primary-button" id="editTransaction">עריכה</button></div>`, onOpen: () => {
    $('#editTransaction').addEventListener('click', async () => { if (item.seriesId) { const purchase = await db.getInstallment(item.seriesId); openTransactionForm(null, purchase); } else openTransactionForm(item); });
    $('#deleteTransaction').addEventListener('click', () => confirmDeleteTransaction(item));
  } });
}

function confirmDeleteTransaction(item) {
  openModal({ title: item.seriesId ? 'מחיקת סדרת תשלומים?' : 'מחיקת התנועה?', eyebrow: 'פעולה בלתי הפיכה', html: `<p>${item.seriesId ? 'כל התשלומים הקשורים לרכישה יימחקו מכל החודשים.' : 'התנועה תימחק מהחודש ומהדוחות.'}</p><div class="form-actions"><button class="secondary-button" id="cancelDelete">ביטול</button><button class="danger-button" id="confirmDelete">כן, למחוק</button></div>`, onOpen: () => {
    $('#cancelDelete').addEventListener('click', closeModal); $('#confirmDelete').addEventListener('click', async () => { try { if (item.seriesId) await db.deleteInstallmentSeries(item.seriesId); else await db.deleteTransaction(item.id); closeModal(); await refreshData(); toast('המחיקה הושלמה'); } catch (error) { handleError(error); } });
  } });
}

function openSettings() {
  openModal({ title: 'הגדרות', eyebrow: 'שליטה וגיבוי', html: `<div class="settings-list">
    <button class="settings-row" id="manageCategories"><span class="settings-icon">🏷️</span><span><strong>ניהול קטגוריות</strong><small>הוספה, עריכה ומחיקה</small></span><b>‹</b></button>
    <button class="settings-row" id="exportBackup"><span class="settings-icon">⬇️</span><span><strong>ייצוא גיבוי</strong><small>שמירת כל הנתונים בקובץ JSON</small></span><b>‹</b></button>
    <button class="settings-row" id="restoreBackup"><span class="settings-icon">⬆️</span><span><strong>שחזור מגיבוי</strong><small>החלפת הנתונים מקובץ שנשמר</small></span><b>‹</b></button>
    <button class="settings-row" id="storageInfo"><span class="settings-icon">💾</span><span><strong>שמירה במכשיר</strong><small>בקשת אחסון מתמשך מהדפדפן</small></span><b>‹</b></button>
    <div class="settings-row"><span class="settings-icon">ℹ️</span><span><strong>גרסת האפליקציה</strong><small>${APP_VERSION} · הנתונים נשמרים רק במכשיר זה</small></span><b></b></div>
  </div><div class="divider"></div><div class="danger-zone"><h3>אזור מסוכן</h3><p>מחיקת כל הנתונים תאפס תנועות, תשלומים וקטגוריות מותאמות.</p><button class="danger-button full-width" id="resetData">מחיקת כל נתוני האפליקציה</button></div>`, onOpen: () => {
    $('#manageCategories').addEventListener('click', openCategoryManager); $('#exportBackup').addEventListener('click', exportBackup); $('#restoreBackup').addEventListener('click', chooseBackupFile); $('#storageInfo').addEventListener('click', requestPersistentStorage); $('#resetData').addEventListener('click', firstResetConfirmation);
  } });
}

function openCategoryManager() {
  const renderList = type => state.categories.filter(c => c.type === type).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, 'he')).map(c => `<div class="category-item"><span class="emoji">${escapeHtml(c.emoji)}</span><strong>${escapeHtml(c.name)}</strong><span class="mini-actions"><button class="mini-button edit-category" data-id="${escapeHtml(c.id)}" aria-label="עריכה">✏️</button><button class="mini-button delete-category" data-id="${escapeHtml(c.id)}" aria-label="מחיקה">🗑️</button></span></div>`).join('');
  openModal({ title: 'ניהול קטגוריות', eyebrow: 'שליטה מלאה', wide: true, html: `<form id="newCategoryForm"><div class="form-grid"><div class="field"><label for="newCategoryName">שם קטגוריה</label><input id="newCategoryName" maxlength="50" required></div><div class="field"><label for="newCategoryEmoji">אימוג׳י</label><input id="newCategoryEmoji" maxlength="12" placeholder="✨" required></div><div class="field full"><span>סוג</span><div class="segmented"><label><input type="radio" name="newCategoryType" value="expense" checked><span>הוצאה</span></label><label><input type="radio" name="newCategoryType" value="income"><span>הכנסה</span></label></div></div></div><p class="form-error" id="categoryError"></p><button class="primary-button full-width" type="submit">הוספת קטגוריה</button></form><div class="divider"></div><div class="category-columns"><section class="category-column"><h3>קטגוריות הוצאה</h3><div class="category-list">${renderList('expense')}</div></section><section class="category-column"><h3>קטגוריות הכנסה</h3><div class="category-list">${renderList('income')}</div></section></div>`, onOpen: modal => {
    modal.querySelector('#newCategoryForm').addEventListener('submit', async event => { event.preventDefault(); try { const name = $('#newCategoryName').value.trim(), emoji = $('#newCategoryEmoji').value.trim(), type = modal.querySelector('input[name="newCategoryType"]:checked').value; if (!name || !emoji) throw new Error('יש להזין שם ואימוג׳י'); await db.saveCategory({ name, emoji, type, order: 999 }); await refreshData(); toast('הקטגוריה נוספה'); openCategoryManager(); } catch (error) { $('#categoryError').textContent = error.message; } });
    modal.querySelectorAll('.edit-category').forEach(button => button.addEventListener('click', () => openCategoryEditor(button.dataset.id)));
    modal.querySelectorAll('.delete-category').forEach(button => button.addEventListener('click', () => openCategoryDelete(button.dataset.id)));
  } });
}

function openCategoryEditor(id) {
  const category = categoryById(id); openModal({ title: 'עריכת קטגוריה', eyebrow: category.type === 'income' ? 'קטגוריית הכנסה' : 'קטגוריית הוצאה', html: `<form id="categoryEditForm"><div class="form-grid"><div class="field"><label for="editCategoryName">שם</label><input id="editCategoryName" value="${escapeHtml(category.name)}" maxlength="50" required></div><div class="field"><label for="editCategoryEmoji">אימוג׳י</label><input id="editCategoryEmoji" value="${escapeHtml(category.emoji)}" maxlength="12" required></div></div><p class="form-note">שינוי השם או האימוג׳י יתעדכן גם בכל התנועות הישנות.</p><p class="form-error" id="editCategoryError"></p><div class="form-actions"><button type="button" class="secondary-button" id="backCategories">חזרה</button><button class="primary-button" type="submit">שמירה</button></div></form>`, onOpen: () => {
    $('#backCategories').addEventListener('click', openCategoryManager); $('#categoryEditForm').addEventListener('submit', async event => { event.preventDefault(); try { const name = $('#editCategoryName').value.trim(), emoji = $('#editCategoryEmoji').value.trim(); if (!name || !emoji) throw new Error('יש להזין שם ואימוג׳י'); await db.saveCategory({ ...category, name, emoji }); await refreshData(); toast('הקטגוריה עודכנה'); openCategoryManager(); } catch (error) { $('#editCategoryError').textContent = error.message; } });
  } });
}

async function openCategoryDelete(id) {
  try {
    const category = categoryById(id); const usage = await db.getCategoryUsage(id); const alternatives = state.categories.filter(c => c.type === category.type && c.id !== id);
    const needsReplacement = usage > 0; const noAlternative = needsReplacement && !alternatives.length;
    openModal({ title: `מחיקת ${category.emoji} ${category.name}`, eyebrow: 'מחיקת קטגוריה', html: `<p>${usage ? `הקטגוריה משויכת ל־${usage} תנועות. התנועות לא יימחקו.` : 'הקטגוריה אינה משויכת לתנועות וניתן למחוק אותה.'}</p>${needsReplacement && alternatives.length ? `<div class="field"><label for="replacementCategory">העברת התנועות לקטגוריה</label><select id="replacementCategory">${alternatives.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.emoji)} ${escapeHtml(c.name)}</option>`).join('')}</select></div>` : ''}${noAlternative ? '<p class="form-note">אין קטגוריה חלופית מאותו סוג. יש ליצור קטגוריה חדשה לפני המחיקה.</p>' : ''}<div class="form-actions"><button class="secondary-button" id="backCategories">חזרה</button><button class="danger-button" id="confirmCategoryDelete" ${noAlternative ? 'disabled' : ''}>מחיקה${needsReplacement ? ' והעברה' : ''}</button></div>`, onOpen: () => {
      $('#backCategories').addEventListener('click', openCategoryManager); $('#confirmCategoryDelete').addEventListener('click', async () => { try { await db.deleteCategoryAndReassign(id, needsReplacement ? $('#replacementCategory').value : null); await refreshData(); toast('הקטגוריה נמחקה והתנועות נשמרו'); openCategoryManager(); } catch (error) { handleError(error); } });
    } });
  } catch (error) { handleError(error); }
}

async function exportBackup() {
  try { const backup = await db.exportBackup(); downloadJson(backup, `my-money-backup-${todayISO()}.json`); toast('קובץ הגיבוי נוצר'); } catch (error) { handleError(error); }
}

function chooseBackupFile() {
  openModal({ title: 'שחזור מגיבוי', eyebrow: 'בדיקה לפני החלפה', html: `<p class="form-note">השחזור יחליף את כל המידע הנוכחי, רק לאחר שהקובץ יעבור בדיקה מלאה.</p><div class="field"><label for="backupFile">בחירת קובץ JSON</label><input id="backupFile" type="file" accept="application/json,.json"></div><p class="form-error" id="backupError"></p><div class="form-actions"><button class="secondary-button" id="cancelRestore">ביטול</button><button class="primary-button" id="validateRestore">בדיקת הקובץ</button></div>`, onOpen: () => {
    $('#cancelRestore').addEventListener('click', closeModal); $('#validateRestore').addEventListener('click', async () => { try { const file = $('#backupFile').files[0]; if (!file) throw new Error('יש לבחור קובץ גיבוי'); if (file.size > 50 * 1024 * 1024) throw new Error('קובץ הגיבוי גדול מדי'); const data = await readJsonFile(file); db.validateBackup(data); confirmRestore(data); } catch (error) { $('#backupError').textContent = error.message; } });
  } });
}

function confirmRestore(data) {
  openModal({ title: 'הקובץ תקין', eyebrow: 'אישור שחזור', html: `<p>נמצאו <strong>${data.transactions.length}</strong> תנועות, <strong>${data.categories.length}</strong> קטגוריות ו־<strong>${data.installments.length}</strong> רכישות בתשלומים.</p><p class="form-note">הפעולה תחליף את כל המידע הנוכחי. מומלץ לייצא גיבוי לפני ההמשך.</p><div class="form-actions"><button class="secondary-button" id="cancelRestore">ביטול</button><button class="danger-button" id="confirmRestore">כן, להחליף ולשחזר</button></div>`, onOpen: () => {
    $('#cancelRestore').addEventListener('click', closeModal); $('#confirmRestore').addEventListener('click', async () => { const button = $('#confirmRestore'); button.disabled = true; try { await db.restoreBackup(data); closeModal(); await refreshData(); toast('השחזור הושלם בהצלחה'); } catch (error) { button.disabled = false; handleError(error); } });
  } });
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) { toast('הדפדפן הזה אינו תומך בבקשת אחסון מתמשך', 'error'); return; }
  try { const already = await navigator.storage.persisted(); const granted = already || await navigator.storage.persist(); toast(granted ? 'הדפדפן אישר אחסון מתמשך' : 'הבקשה לא אושרה. הגיבויים עדיין חשובים.', granted ? 'success' : 'error'); } catch (error) { handleError(error); }
}

function firstResetConfirmation() {
  openModal({ title: 'מחיקת כל הנתונים?', eyebrow: 'אישור ראשון מתוך שניים', html: '<p>כל התנועות, התשלומים והקטגוריות המותאמות יימחקו. קטגוריות ברירת המחדל ייווצרו מחדש.</p><div class="form-actions"><button class="secondary-button" id="cancelReset">ביטול</button><button class="danger-button" id="continueReset">המשך לאישור נוסף</button></div>', onOpen: () => { $('#cancelReset').addEventListener('click', closeModal); $('#continueReset').addEventListener('click', secondResetConfirmation); } });
}

function secondResetConfirmation() {
  openModal({ title: 'אישור סופי', eyebrow: 'אישור שני מתוך שניים', html: '<p class="form-note">לא ניתן לבטל פעולה זו. כדי להמשיך, יש להקליד <strong>למחוק הכל</strong>.</p><div class="field"><label for="resetPhrase">טקסט אישור</label><input id="resetPhrase" autocomplete="off"></div><p class="form-error" id="resetError"></p><div class="form-actions"><button class="secondary-button" id="cancelReset">ביטול</button><button class="danger-button" id="confirmReset">מחיקה סופית</button></div>', onOpen: () => {
    $('#cancelReset').addEventListener('click', closeModal); $('#confirmReset').addEventListener('click', async () => { if ($('#resetPhrase').value.trim() !== 'למחוק הכל') { $('#resetError').textContent = 'טקסט האישור אינו תואם'; return; } try { await db.resetAllData(); closeModal(); await refreshData(); toast('כל הנתונים נמחקו והאפליקציה אופסה'); } catch (error) { handleError(error); } });
  } });
}

function openSearch() {
  openModal({ title: 'חיפוש וסינון', eyebrow: 'כל התנועות', wide: true, html: `<form id="searchForm"><div class="form-grid"><div class="field full"><label for="searchText">שם עסק, מקור הכנסה או תיאור</label><input id="searchText" type="search" placeholder="הקלדה לחיפוש"></div><div class="field"><label for="searchCategory">קטגוריה</label><select id="searchCategory"><option value="">כל הקטגוריות</option>${state.categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.emoji)} ${escapeHtml(c.name)}</option>`).join('')}</select></div><div class="field"><label for="searchType">סוג תנועה</label><select id="searchType"><option value="">הכול</option><option value="expense">הוצאות</option><option value="income">הכנסות</option></select></div><div class="field"><label for="searchFrom">מתאריך</label><input id="searchFrom" type="date"></div><div class="field"><label for="searchTo">עד תאריך</label><input id="searchTo" type="date"></div></div></form><div class="search-results" id="searchResults"></div>`, onOpen: modal => {
    const filter = () => {
      const text = $('#searchText').value.trim().toLocaleLowerCase('he'); const category = $('#searchCategory').value, type = $('#searchType').value, from = $('#searchFrom').value, to = $('#searchTo').value;
      const results = state.transactions.filter(t => (!text || `${t.title} ${t.description || ''}`.toLocaleLowerCase('he').includes(text)) && (!category || t.categoryId === category) && (!type || t.type === type) && (!from || t.date >= from) && (!to || t.date <= to)).sort((a, b) => b.date.localeCompare(a.date));
      renderSearchResults(results);
    };
    modal.querySelectorAll('input, select').forEach(input => input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', debounce(filter, 80))); filter();
  } });
}

function renderSearchResults(items) {
  const target = $('#searchResults'); target.replaceChildren(); if (!items.length) { target.innerHTML = '<div class="empty-state"><span>🔎</span>לא נמצאו תנועות מתאימות</div>'; return; }
  items.slice(0, 300).forEach(item => { const category = categoryById(item.categoryId); const button = document.createElement('button'); button.className = 'transaction-item'; button.innerHTML = `<span class="transaction-emoji">${escapeHtml(category.emoji)}</span><span class="transaction-main"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(category.name)} · ${numberHtml(formatDate(item.date))}</span></span><span class="transaction-amount ${item.type}">${item.type === 'income' ? '+' : '−'}${moneyHtml(item.ilsMinor)}</span>`; button.addEventListener('click', () => showTransactionDetails(item.id)); target.append(button); });
  if (items.length > 300) target.insertAdjacentHTML('beforeend', '<p class="form-note">מוצגות 300 התוצאות הראשונות. אפשר לצמצם את הסינון.</p>');
}

function handleError(error) { console.error(error); toast(error?.message || 'אירעה שגיאה. כדאי לנסות שוב.', 'error'); }

function registerEvents() {
  $('#previousMonth').addEventListener('click', () => moveMonth(-1)); $('#nextMonth').addEventListener('click', () => moveMonth(1)); $('#monthPickerButton').addEventListener('click', showMonthPicker);
  $('#incomeCard').addEventListener('click', () => openMonthlyTransactions('income')); $('#expenseCard').addEventListener('click', () => openMonthlyTransactions('expense'));
  $('#addTransactionButton').addEventListener('click', () => openTransactionForm()); $('#settingsButton').addEventListener('click', openSettings); $('#openSearchButton').addEventListener('click', openSearch);
  $('#showAllTransactions').addEventListener('click', () => { state.showAll = !state.showAll; renderTransactions(); });
  $('#reportYear').addEventListener('change', () => { state.reportYear = Number($('#reportYear').value); renderReports(); });
}

async function init() {
  registerEvents();
  try {
    await db.openDatabase(); await refreshData();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker registration failed', error));
  } catch (error) {
    handleError(error); document.querySelector('main').insertAdjacentHTML('afterbegin', '<div class="form-note">לא ניתן לפתוח את מסד הנתונים. ודאו שלא פתחתם את הקובץ ישירות ושגלישה פרטית כבויה.</div>');
  }
}

init();
