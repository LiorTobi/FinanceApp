import { MONTHS_HE } from './constants.js';

export const uid = (prefix = 'id') => `${prefix}-${crypto.randomUUID()}`;

export function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function toMinor(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) throw new Error('יש להזין סכום חיובי עם עד שתי ספרות אחרי הנקודה');
  const [whole, fraction = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error('הסכום אינו תקין');
  return minor;
}

export function minorToInput(minor) {
  return (Number(minor || 0) / 100).toFixed(2).replace(/\.00$/, '');
}

export function formatMoney(minor, currency = 'ILS', options = {}) {
  try {
    const minorValue = Number(minor || 0);
    const amount = Math.abs(minorValue) / 100;
    const showDecimals = options.alwaysDecimals || Math.abs(minorValue) % 100 !== 0;
    const number = new Intl.NumberFormat('en-US', {
      useGrouping: true,
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: 2
    }).format(amount);
    const symbol = currency === 'ILS' ? '₪' : new Intl.NumberFormat('en-US', {
      style: 'currency', currency, currencyDisplay: 'narrowSymbol'
    }).formatToParts(0).find(part => part.type === 'currency')?.value || currency;
    return `${minorValue < 0 ? '−' : ''}${symbol}${number}`;
  } catch {
    const minorValue = Number(minor || 0);
    const amount = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(minorValue) / 100);
    return `${minorValue < 0 ? '−' : ''}${currency} ${amount}`;
  }
}

export function formatDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('he-IL').format(new Date(year, month - 1, day));
}

export function formatMonth(year, monthIndex) { return `${MONTHS_HE[monthIndex]} ${year}`; }
export function monthKey(year, monthIndex) { return `${year}-${String(monthIndex + 1).padStart(2, '0')}`; }
export function dateMonthKey(iso) { return String(iso).slice(0, 7); }

export function addMonthsClamped(isoDate, count) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const targetFirst = new Date(year, month - 1 + count, 1);
  const lastDay = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate();
  const result = new Date(targetFirst.getFullYear(), targetFirst.getMonth(), Math.min(day, lastDay));
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}-${String(result.getDate()).padStart(2, '0')}`;
}

export function splitMinor(total, parts) {
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isInteger(parts) || parts < 2 || parts > 120) throw new Error('פרטי התשלומים אינם תקינים');
  const base = Math.floor(total / parts);
  const values = Array(parts).fill(base);
  values[parts - 1] += total - base * parts;
  return values;
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { try { resolve(JSON.parse(reader.result)); } catch { reject(new Error('הקובץ אינו קובץ JSON תקין')); } };
    reader.onerror = () => reject(new Error('לא ניתן לקרוא את הקובץ'));
    reader.readAsText(file);
  });
}

export function debounce(fn, wait = 180) {
  let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}
