import { CATEGORIES, localDate, parseAmount, validDate, validateEntry, monthlySummary, categorySummary, shiftMonth, csvCell, readLedger, writeLedger } from './core.mjs';

const icons = {
  leaf: '<path d="M5 19C2 8 12 3 21 3c0 10-5 18-14 15L18 6"/><path d="M4 22 13 13"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  chart: '<path d="M4 3v17h17M8 15v-4m5 4V6m5 9V9"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 4M12 17h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M7 15h2m3 0h2"/>',
  'chevron-left': '<path d="m14 6-6 6 6 6"/>',
  'chevron-right': '<path d="m10 6 6 6-6 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  wallet: '<path d="M20 8H5a2 2 0 0 1 0-4h13v4M4 6v13a2 2 0 0 0 2 2h14V8M16 12h5v5h-5z"/>',
  'arrow-down-left': '<path d="m18 6-12 12M6 7v11h11"/>',
  'arrow-up-right': '<path d="m6 18 12-12M7 6h11v11"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  sort: '<path d="M8 3v18m-4-4 4 4 4-4M16 3v18m-4-14 4-4 4 4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  edit: '<path d="m14 5 5 5M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3ZM9 7h6M9 11h6M9 15h3"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.leaf}</svg>`;
document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
const $ = selector => document.querySelector(selector);
const trendDetails = document.createElement('details');
trendDetails.className = 'trend-details';
trendDetails.innerHTML = '<summary>查看图表数据</summary><div id="trend-data" class="table-scroll"></div>';
$('#trend-chart').after(trendDetails);
const STORAGE_KEY = 'qinghe-ledger-v1';
const today = localDate();
const currentMonth = today.slice(0, 7);
let selectedMonth = currentMonth;
let chartType = 'expense';
let chartPeriod = 'day';
let filterType = 'all';
let page = 1;
let entryType = 'expense';
let editingId = null;
let confirmCallback = null;
let toastTimer;
let storageProblem = false;
let storageSnapshot = null;
let restoreFocus = null;
let isSaving = false;

function loadEntries() {
  try {
    const result = readLedger(localStorage, STORAGE_KEY, currentMonth);
    storageSnapshot = result.snapshot;
    return result.entries;
  } catch {
    storageProblem = true;
    return [];
  }
}
let entries = loadEntries();

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}

async function persist(nextEntries) {
  const expected = storageSnapshot;
  const write = () => {
    try {
      storageSnapshot = writeLedger(localStorage, STORAGE_KEY, expected, nextEntries);
      entries = nextEntries;
      return true;
    } catch (error) {
      if (error.message.includes('其他页面')) {
        entries = loadEntries();
        render();
      }
      const message = error.message.includes('其他页面') ? error.message : '未能保存，请检查浏览器存储权限或空间。账目未变更。';
      toast(message);
      if ($('#entry-dialog').open) $('#form-error').textContent = message;
      return false;
    }
  };
  return navigator.locks ? navigator.locks.request(STORAGE_KEY, write) : write();
}

const money = cents => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
const escapeHTML = text => String(text).replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]);
function metric(cents) {
  const [whole, decimals] = money(cents).split('.');
  return `<span class="currency">¥</span>${whole}<span class="decimal">.${decimals}</span>`;
}

function render() {
  const summary = monthlySummary(entries, selectedMonth);
  const [year, month] = selectedMonth.split('-');
  $('#month-display').textContent = `${year} 年 ${Number(month)} 月`;
  $('#month-picker').value = selectedMonth;
  $('#prev-month').disabled = selectedMonth === '1900-01';
  $('#next-month').disabled = selectedMonth === '2100-12';
  $('#balance-total').innerHTML = metric(summary.balance);
  $('#income-total').innerHTML = metric(summary.income);
  $('#expense-total').innerHTML = metric(summary.expense);
  for (const id of ['balance-total', 'income-total', 'expense-total']) {
    document.getElementById(id).style.fontSize = `clamp(13px, ${Math.min(14, 155 / document.getElementById(id).textContent.length)}cqw, 32px)`;
  }
  $('#income-count').textContent = `${summary.rows.filter(row => row.type === 'income').length} 笔收入`;
  $('#expense-count').textContent = `${summary.rows.filter(row => row.type === 'expense').length} 笔支出`;
  $('.balance-chip').textContent = summary.balance < 0 ? '支出超出收入' : summary.balance === 0 ? '收支平衡' : '收支有度';
  $('#saving-rate').textContent = summary.income ? `结余率 ${Math.round(summary.balance / summary.income * 100)}%` : '记录生活，慢慢积累';
  $('#demo-badge').hidden = !entries.some(entry => entry.demo);
  renderTrend(summary);
  renderCategories(summary);
  renderTable(summary);
}

function renderCategories(summary) {
  const categories = categorySummary(summary.rows, chartType);
  const total = chartType === 'expense' ? summary.expense : summary.income;
  let position = 0;
  const gradient = categories.map(category => {
    const start = position;
    position += category.amount / total * 100;
    return `${category.color} ${start}% ${position}%`;
  }).join(',');
  $('#donut').style.background = total ? `conic-gradient(${gradient})` : '#eef1e8';
  $('#donut').setAttribute('role', 'img');
  $('#donut').setAttribute('aria-label', `${chartType === 'expense' ? '支出' : '收入'}分类占比：${categories.map(category => `${category.name} ${money(category.amount)}元`).join('，') || '暂无记录'}`);
  $('#donut-caption').textContent = chartType === 'expense' ? '总支出' : '总收入';
  $('#donut-total').textContent = `¥${money(total)}`;
  $('#donut-total').style.fontSize = `${Math.max(10, Math.min(18, 160 / $('#donut-total').textContent.length))}px`;
  $('#category-insight').textContent = categories.length ? `${categories[0].name}占比最高 · ${(categories[0].amount / total * 100).toFixed(1)}%` : '这个月还没有相关记录';
  $('#category-legend').innerHTML = categories.length ? categories.map(category => `<div class="category-item" title="${category.name}：¥${money(category.amount)}"><i style="background:${category.color}"></i><span>${category.name}</span><strong>${(category.amount / total * 100).toFixed(1)}%</strong></div>`).join('') : '<div class="category-empty">记下一笔，消费画像就从这里开始。</div>';
}

function renderTrend(summary) {
  const [year, month] = selectedMonth.split('-').map(Number);
  const days = new Date(year, month, 0).getDate();
  const count = chartPeriod === 'day' ? days : Math.ceil(days / 7);
  const bins = Array.from({ length: count }, (_, index) => ({ income: 0, expense: 0, label: chartPeriod === 'day' ? `${index + 1}日` : `第${index + 1}周` }));
  for (const row of summary.rows) {
    const day = Number(row.date.slice(-2));
    bins[chartPeriod === 'day' ? day - 1 : Math.floor((day - 1) / 7)][row.type] += row.amount / 100;
  }
  const max = Math.max(100, ...bins.flatMap(bin => [bin.income, bin.expense]));
  const step = max > 10000 ? 5000 : max > 2000 ? 1000 : max > 500 ? 250 : max > 100 ? 100 : 25;
  const ceiling = Math.ceil(max / step) * step;
  const width = 550, left = 48, right = 536, top = 20, bottom = 178;
  const x = index => left + index / Math.max(count - 1, 1) * (right - left);
  const y = value => bottom - value / ceiling * (bottom - top);
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = ceiling * index / 4;
    const label = value >= 1000 ? `${+(value / 1000).toFixed(1)}k` : Math.round(value);
    return `<line x1="${left}" y1="${y(value)}" x2="${right}" y2="${y(value)}" stroke="#edf0e7" stroke-dasharray="3 4"/><text x="${left - 10}" y="${y(value) + 3}" text-anchor="end">${label}</text>`;
  }).join('');
  const labels = bins.map((bin, index) => chartPeriod === 'week' || index % 5 === 0 || index === count - 1 ? `<text x="${x(index)}" y="203" text-anchor="middle">${bin.label}</text>` : '').join('');
  const line = type => bins.map((bin, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(bin[type]).toFixed(2)}`).join(' ');
  const dots = bins.map((bin, index) => `<g><title>${bin.label}：收入 ¥${money(Math.round(bin.income * 100))}，支出 ¥${money(Math.round(bin.expense * 100))}</title><rect x="${x(index) - 6}" y="${top}" width="12" height="${bottom - top}" fill="transparent"/><circle cx="${x(index)}" cy="${y(bin.expense)}" r="${bin.expense ? 2.8 : 0}" fill="#c8aa85" stroke="white" stroke-width="1.3"/></g>`).join('');
  $('#trend-chart').innerHTML = `<svg viewBox="0 0 ${width} 215" role="img" aria-labelledby="trend-title"><title id="trend-title">${year}年${month}月${chartPeriod === 'day' ? '每日' : '每周（每7日一组）'}收支趋势：收入 ${money(summary.income)} 元，支出 ${money(summary.expense)} 元</title><defs><linearGradient id="income-area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#95b187" stop-opacity=".16"/><stop offset="1" stop-color="#95b187" stop-opacity=".01"/></linearGradient></defs>${grid}<path d="${line('income')} L${right},${bottom} L${left},${bottom} Z" fill="url(#income-area)"/><path d="${line('income')}" fill="none" stroke="#89a57b" stroke-width="2" stroke-linejoin="round"/><path d="${line('expense')}" fill="none" stroke="#c8aa85" stroke-width="2" stroke-linejoin="round"/>${dots}${labels}</svg>`;
  $('#trend-data').innerHTML = `<table><caption>收支趋势详细数据（元）</caption><thead><tr><th>日期分组</th><th>收入</th><th>支出</th></tr></thead><tbody>${bins.map(bin => `<tr><th>${bin.label}</th><td>${money(Math.round(bin.income * 100))}</td><td>${money(Math.round(bin.expense * 100))}</td></tr>`).join('')}</tbody></table>`;
  const expenseCount = summary.rows.filter(entry => entry.type === 'expense').length;
  $('#trend-insight').textContent = expenseCount ? `本月共 ${expenseCount} 笔支出，平均每笔 ¥${money(Math.round(summary.expense / expenseCount))}。` : '还没有支出记录，给生活留下一点小小的注脚吧。';
}

function renderTable(summary) {
  const query = $('#search').value.trim().toLowerCase();
  const category = $('#category-filter').value;
  const rows = summary.rows.filter(entry => (filterType === 'all' || entry.type === filterType) && (category === 'all' || entry.category === category) && `${entry.category} ${entry.note}`.toLowerCase().includes(query)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const totalPages = Math.max(1, Math.ceil(rows.length / 5));
  page = Math.min(page, totalPages);
  const pageRows = rows.slice((page - 1) * 5, page * 5);
  $('#record-count').textContent = `${rows.length} 笔`;
  $('#entries').innerHTML = pageRows.map(entry => {
    const category = CATEGORIES[entry.type].find(category => category.name === entry.category);
    const label = escapeHTML(`${entry.date} ${entry.note || entry.category}`);
    return `<tr><td><div class="entry-description"><span class="category-icon" style="background:${category.color}20;color:${category.color}">${category.icon}</span><div><div class="entry-title">${entry.category}${entry.demo ? '<span class="sample-label">示例</span>' : ''}</div><div class="entry-note">${escapeHTML(entry.note || '日常的一笔记录')}</div><div class="mobile-entry-date">${entry.date.replaceAll('-', '.')}</div></div></div></td><td>${entry.date.replaceAll('-', '.')}</td><td><span class="type-badge ${entry.type}">${entry.type === 'income' ? '收入' : '支出'}</span></td><td class="amount-column entry-amount ${entry.type}">${entry.type === 'income' ? '+' : '−'} ¥${money(entry.amount)}</td><td class="actions-column"><div class="row-actions"><button class="icon-button" data-edit="${escapeHTML(entry.id)}" aria-label="编辑 ${label}" title="编辑">${icon('edit')}</button><button class="icon-button delete" data-delete="${escapeHTML(entry.id)}" aria-label="删除 ${label}" title="删除">${icon('trash')}</button></div></td></tr>`;
  }).join('');
  $('#empty-state').hidden = rows.length > 0;
  $('#page-info').textContent = rows.length ? `共 ${rows.length} 笔记录 · 显示 ${(page - 1) * 5 + 1}–${Math.min(page * 5, rows.length)} 笔` : '共 0 笔记录';
  $('#page-number').textContent = `${page} / ${totalPages}`;
  $('#prev-page').disabled = page <= 1;
  $('#next-page').disabled = page >= totalPages;
}

function updateEntryType(type) {
  entryType = type;
  document.querySelectorAll('[data-entry-type]').forEach(button => {
    button.classList.toggle('active', button.dataset.entryType === type);
    button.setAttribute('aria-pressed', button.dataset.entryType === type);
  });
  $('#entry-category').innerHTML = CATEGORIES[type].map(category => `<option>${category.name}</option>`).join('');
}

function openEntry(entry = null) {
  editingId = entry?.id ?? null;
  $('#entry-form').reset();
  updateEntryType(entry?.type || 'expense');
  $('#dialog-title').textContent = entry ? '编辑这笔记录' : '记录一笔日常';
  $('#amount').value = entry ? (entry.amount / 100).toFixed(2) : '';
  const lastDay = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)), 0).getDate();
  $('#entry-date').value = entry?.date || (selectedMonth === currentMonth ? today : `${selectedMonth}-${String(Math.min(Number(today.slice(-2)), lastDay)).padStart(2, '0')}`);
  if (entry) $('#entry-category').value = entry.category;
  $('#entry-note').value = entry?.note || '';
  $('#form-error').textContent = '';
  $('#entry-dialog').showModal();
  $('#amount').focus();
}

$('#entry-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (isSaving) return;
  isSaving = true;
  const saveButton = $('#entry-form [type="submit"]');
  saveButton.disabled = true;
  try {
    const newEntry = validateEntry({
      id: editingId || crypto.randomUUID(), type: entryType,
      amount: parseAmount($('#amount').value), category: $('#entry-category').value,
      date: $('#entry-date').value, note: $('#entry-note').value.trim(), demo: false,
    });
    if (editingId && !entries.some(entry => entry.id === editingId)) throw new Error('这笔账目已在其他页面删除，请关闭后重新记账。');
    const updated = editingId ? entries.map(entry => entry.id === editingId ? newEntry : entry) : [...entries, newEntry];
    if (!await persist(updated)) return;
    selectedMonth = newEntry.date.slice(0, 7);
    filterType = 'all';
    $('#category-filter').value = 'all';
    $('#search').value = '';
    page = 1;
    updateFilterTabs();
    render();
    $('#entry-dialog').close();
    $('#add-entry').focus({ preventScroll: true });
    toast(editingId ? '这笔账目已更新' : '记好了，生活又清楚了一点。');
  } catch (error) {
    $('#form-error').textContent = error.message;
  } finally {
    isSaving = false;
    saveButton.disabled = false;
  }
});

function askConfirm(title, description, callback) {
  $('#confirm-title').textContent = title;
  $('#confirm-description').textContent = description;
  confirmCallback = callback;
  $('#confirm-dialog').showModal();
}
$('#confirm-action').addEventListener('click', async () => {
  $('#confirm-action').disabled = true;
  if (await confirmCallback?.() !== false) {
    $('#confirm-dialog').close();
    if (restoreFocus) {
      restoreFocus();
      restoreFocus = null;
    }
  }
  $('#confirm-action').disabled = false;
});
$('#confirm-dialog').addEventListener('close', () => { confirmCallback = null; });
$('#clear-demo').addEventListener('click', () => askConfirm('清空示例账目？', '仅删除带「示例」标记的账目，你新增或编辑过的记录会保留。', async () => {
  if (!await persist(entries.filter(entry => !entry.demo))) return false;
  page = 1;
  render();
  toast('示例已清空，开始记录自己的生活吧。');
  restoreFocus = () => $('#add-entry').focus();
}));
$('#entries').addEventListener('click', event => {
  const editButton = event.target.closest('[data-edit]');
  const deleteButton = event.target.closest('[data-delete]');
  if (editButton) openEntry(entries.find(entry => entry.id === editButton.dataset.edit));
  if (deleteButton) {
    const entry = entries.find(entry => entry.id === deleteButton.dataset.delete);
    askConfirm('删除这笔账目？', `${entry.date} · ${entry.category} · ¥${money(entry.amount)}。删除后无法撤销。`, async () => {
      if (!await persist(entries.filter(row => row.id !== entry.id))) return false;
      render();
      toast('账目已删除');
      restoreFocus = () => ($('#entries [data-edit]') || $('#empty-add')).focus({ preventScroll: true });
    });
  }
});
$('#add-entry').addEventListener('click', () => openEntry());
$('#empty-add').addEventListener('click', () => openEntry());
$('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
}));
document.querySelectorAll('[data-entry-type]').forEach(button => button.addEventListener('click', () => updateEntryType(button.dataset.entryType)));
function changeMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`)) return;
  selectedMonth = month;
  page = 1;
  render();
}
$('#prev-month').addEventListener('click', () => changeMonth(shiftMonth(selectedMonth, -1)));
$('#next-month').addEventListener('click', () => changeMonth(shiftMonth(selectedMonth, 1)));
$('#current-month').addEventListener('click', () => changeMonth(currentMonth));
$('#month-picker').addEventListener('change', event => changeMonth(event.target.value));
$('#chart-type').addEventListener('change', event => { chartType = event.target.value; render(); });
document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {
  chartPeriod = button.dataset.period;
  document.querySelectorAll('[data-period]').forEach(item => {
    item.classList.toggle('active', item === button);
    item.setAttribute('aria-pressed', item === button);
  });
  render();
}));
function updateFilterTabs() {
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === filterType);
    button.setAttribute('aria-pressed', button.dataset.filter === filterType);
  });
}
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  filterType = button.dataset.filter;
  page = 1;
  updateFilterTabs();
  render();
}));
for (const name of ['#search', '#category-filter']) $(name).addEventListener('input', () => { page = 1; render(); });
$('#prev-page').addEventListener('click', () => { page--; render(); });
$('#next-page').addEventListener('click', () => { page++; render(); });
document.querySelectorAll('[data-nav]').forEach(link => link.addEventListener('click', () => {
  document.querySelectorAll('[data-nav]').forEach(item => item.classList.toggle('active', item === link));
}));
$('#export').addEventListener('click', () => {
  const rows = monthlySummary(entries, selectedMonth).rows.sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) return toast('本月还没有账目可导出。');
  const csv = [['日期', '类型', '分类', '金额（元）', '备注', '示例数据'], ...rows.map(entry => [entry.date, entry.type === 'income' ? '收入' : '支出', entry.category, (entry.amount / 100).toFixed(2), entry.note, entry.demo ? '是' : '否'])].map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `妙记账本账单-${selectedMonth}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`已导出 ${rows.length} 笔当月账目`);
});

$('#category-filter').innerHTML += Object.entries(CATEGORIES).map(([type, categories]) => `<optgroup label="${type === 'expense' ? '支出分类' : '收入分类'}">${categories.map(category => `<option>${category.name}</option>`).join('')}</optgroup>`).join('');
$('#today-label').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
render();
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return;
  entries = loadEntries();
  render();
  toast('账本已与其他页面同步。');
});
if (storageProblem) {
  $('.local-status').textContent = '存储异常 · 原数据未覆盖';
  toast('账目读取异常，原数据未覆盖。请先检查浏览器存储或备份。');
  // Avoid silently replacing potentially recoverable data.
  $('#entry-form').addEventListener('submit', event => event.stopImmediatePropagation(), true);
  for (const selector of ['#add-entry', '#empty-add', '#export']) $(selector).disabled = true;
}
