export const APP_VERSION = '1.0.0';
export const DB_NAME = 'my-money-he';
export const DB_VERSION = 1;
export const BACKUP_SCHEMA_VERSION = 1;

export const DEFAULT_CATEGORIES = [
  { id: 'expense-food', name: 'אוכל ומסעדות', emoji: '🍔', type: 'expense' },
  { id: 'expense-shopping', name: 'קניות וביגוד', emoji: '🛍️', type: 'expense' },
  { id: 'expense-car', name: 'רכב ודלק', emoji: '🚗', type: 'expense' },
  { id: 'expense-transport', name: 'תחבורה וחניה', emoji: '🅿️', type: 'expense' },
  { id: 'expense-entertainment', name: 'בילויים', emoji: '🎉', type: 'expense' },
  { id: 'expense-travel', name: 'חופשות וטיסות', emoji: '✈️', type: 'expense' },
  { id: 'expense-subscriptions', name: 'מנויים ושירותים', emoji: '📱', type: 'expense' },
  { id: 'expense-health', name: 'בריאות וטיפוח', emoji: '💊', type: 'expense' },
  { id: 'expense-study', name: 'לימודים', emoji: '📚', type: 'expense' },
  { id: 'expense-gifts', name: 'מתנות', emoji: '🎁', type: 'expense' },
  { id: 'expense-bills', name: 'חשבונות והוצאות קבועות', emoji: '🧾', type: 'expense' },
  { id: 'expense-other', name: 'אחר', emoji: '📦', type: 'expense' },
  { id: 'income-salary', name: 'משכורת', emoji: '💼', type: 'income' },
  { id: 'income-extra-salary', name: 'משכורת נוספת', emoji: '💰', type: 'income' },
  { id: 'income-refunds', name: 'החזרים', emoji: '🔄', type: 'income' },
  { id: 'income-gifts', name: 'מתנות', emoji: '🎁', type: 'income' },
  { id: 'income-sales', name: 'מכירת פריטים', emoji: '🏷️', type: 'income' },
  { id: 'income-other', name: 'הכנסות אחרות', emoji: '➕', type: 'income' }
];

export const CURRENCIES = [
  ['ILS', 'שקל ישראלי (₪)'], ['USD', 'דולר ארה״ב ($)'], ['EUR', 'אירו (€)'], ['GBP', 'ליש״ט (£)'],
  ['CAD', 'דולר קנדי'], ['AUD', 'דולר אוסטרלי'], ['CHF', 'פרנק שווייצרי'], ['JPY', 'ין יפני'],
  ['CNY', 'יואן סיני'], ['INR', 'רופי הודי'], ['AED', 'דירהם איחוד האמירויות'], ['THB', 'באט תאילנדי'],
  ['TRY', 'לירה טורקית'], ['PLN', 'זלוטי פולני'], ['CZK', 'קורונה צ׳כית'], ['HUF', 'פורינט הונגרי']
];

export const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
export const CHART_COLORS = ['#e05a5a', '#f29e4c', '#f7c948', '#62b27f', '#4d9de0', '#7868e6', '#b56ad9', '#ef7fa5', '#7b8d93', '#2a9d8f', '#ef8354', '#6c757d'];
