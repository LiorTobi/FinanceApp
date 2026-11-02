import { CHART_COLORS, MONTHS_HE } from './constants.js';
import { formatMoney } from './utils.js';

const svgNS = 'http://www.w3.org/2000/svg';
const element = (name, attrs = {}) => { const node = document.createElementNS(svgNS, name); Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value)); return node; };
const svgText = (svg, text, x, y, attrs = {}) => { const node = element('text', { x, y, ...attrs }); node.textContent = text; svg.append(node); return node; };

export function renderDonut(svg, legend, data) {
  svg.replaceChildren(); legend.replaceChildren(); const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!total) {
    svg.append(element('circle', { cx: 100, cy: 100, r: 74, fill: 'none', stroke: '#edf1ef', 'stroke-width': 28 }));
    legend.innerHTML = '<div class="empty-state"><span>📊</span>עוד אין הוצאות בחודש הזה</div>'; return;
  }
  let offset = 0; const circumference = 2 * Math.PI * 74;
  data.forEach((item, index) => {
    const ratio = item.value / total; const color = CHART_COLORS[index % CHART_COLORS.length];
    svg.append(element('circle', { cx: 100, cy: 100, r: 74, fill: 'none', stroke: color, 'stroke-width': 28, 'stroke-dasharray': `${ratio * circumference} ${circumference}`, 'stroke-dashoffset': -offset * circumference, 'stroke-linecap': 'butt' }));
    offset += ratio;
    const row = document.createElement('div'); row.className = 'legend-row';
    row.innerHTML = `<i class="legend-dot" style="background:${color}"></i><span>${item.category.emoji} ${item.category.name}</span><strong><span class="money-value" dir="ltr">${formatMoney(item.value)}</span></strong>`; legend.append(row);
  });
}

function chartBase(svg, values, includeZero = true) {
  svg.replaceChildren(); const max = Math.max(...values, includeZero ? 0 : -Infinity); const min = Math.min(...values, includeZero ? 0 : Infinity); const range = Math.max(max - min, 1);
  const plot = { left: 44, right: 744, top: 20, bottom: 220, width: 700, height: 200, max, min, range };
  for (let i = 0; i <= 4; i++) { const y = plot.top + i * plot.height / 4; svg.append(element('line', { x1: plot.left, y1: y, x2: plot.right, y2: y, stroke: '#dfe6e2', 'stroke-width': 1 })); }
  return plot;
}

export function renderComparisonChart(svg, months) {
  const values = months.flatMap(m => [m.income, m.expense]); const p = chartBase(svg, values); const max = Math.max(p.max, 1); const slot = p.width / 12; const bar = 15;
  months.forEach((month, index) => {
    const center = p.left + slot * index + slot / 2;
    const incomeH = month.income / max * p.height; const expenseH = month.expense / max * p.height;
    svg.append(element('rect', { x: center - bar - 2, y: p.bottom - incomeH, width: bar, height: incomeH, rx: 4, fill: '#108a5b' }));
    svg.append(element('rect', { x: center + 2, y: p.bottom - expenseH, width: bar, height: expenseH, rx: 4, fill: '#d64c4c' }));
    svgText(svg, MONTHS_HE[index].slice(0, 3), center, 246, { 'text-anchor': 'middle', fill: '#718078', 'font-size': 12, direction: 'rtl' });
  });
}

export function renderBalanceChart(svg, months) {
  const values = months.map(m => m.balance); const p = chartBase(svg, values); const zeroY = p.top + (p.max / p.range) * p.height; const step = p.width / 11;
  svg.append(element('line', { x1: p.left, y1: zeroY, x2: p.right, y2: zeroY, stroke: '#87968e', 'stroke-width': 1.5 }));
  const points = values.map((value, i) => `${p.left + i * step},${p.top + ((p.max - value) / p.range) * p.height}`).join(' ');
  svg.append(element('polyline', { points, fill: 'none', stroke: '#3867d6', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  values.forEach((value, i) => { const x = p.left + i * step; const y = p.top + ((p.max - value) / p.range) * p.height; svg.append(element('circle', { cx: x, cy: y, r: 5, fill: value >= 0 ? '#108a5b' : '#d64c4c', stroke: 'white', 'stroke-width': 2 })); svgText(svg, MONTHS_HE[i].slice(0, 3), x, 246, { 'text-anchor': 'middle', fill: '#718078', 'font-size': 12 }); });
}
