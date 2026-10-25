export const CATEGORIES = {
  expense: [
    { name: '餐饮美食', icon: '餐', color: '#82a98c' },
    { name: '购物消费', icon: '购', color: '#c5a47a' },
    { name: '居家生活', icon: '居', color: '#b8c99b' },
    { name: '交通出行', icon: '行', color: '#88acbb' },
    { name: '休闲娱乐', icon: '乐', color: '#b6a3c6' },
    { name: '医疗健康', icon: '医', color: '#d69e92' },
    { name: '学习成长', icon: '学', color: '#d1c174' },
    { name: '其他支出', icon: '其', color: '#a7aaa9' },
  ],
  income: [
    { name: '工资薪酬', icon: '薪', color: '#52977a' },
    { name: '兼职副业', icon: '副', color: '#91b6a1' },
    { name: '投资收益', icon: '投', color: '#b4c69c' },
    { name: '其他收入', icon: '其', color: '#bcaa89' },
  ],
};

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseAmount(value) {
  const normalized = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(normalized)) throw new Error('请输入大于 0 的金额，最多保留两位小数。');
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents <= 0) throw new Error('金额需要大于 0。');
  return cents;
}

export function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > '2100-12-31') return false;
  const parsed = new Date(`${date}T12:00:00`);
  return !Number.isNaN(parsed.valueOf()) && localDate(parsed) === date;
}

export function validateEntry(entry) {
  if (!CATEGORIES[entry.type]) throw new Error('请选择收入或支出。');
  if (!CATEGORIES[entry.type].some(category => category.name === entry.category)) throw new Error('请选择对应的分类。');
  if (!Number.isSafeInteger(entry.amount) || entry.amount <= 0 || entry.amount > 99999999999) throw new Error('金额无效。');
  if (!validDate(entry.date)) throw new Error('请选择 1900 至 2100 年之间的有效日期。');
  if (typeof entry.note !== 'string' || entry.note.length > 80) throw new Error('备注最多 80 个字。');
  return entry;
}

export function monthlySummary(entries, month) {
  const rows = entries.filter(entry => entry.date.startsWith(`${month}-`));
  const income = rows.filter(entry => entry.type === 'income').reduce((sum, entry) => sum + entry.amount, 0);
  const expense = rows.filter(entry => entry.type === 'expense').reduce((sum, entry) => sum + entry.amount, 0);
  return { rows, income, expense, balance: income - expense };
}

export function categorySummary(entries, type) {
  return CATEGORIES[type].map(category => ({ ...category, amount: entries.filter(entry => entry.type === type && entry.category === category.name).reduce((sum, entry) => sum + entry.amount, 0) })).filter(category => category.amount > 0).sort((a, b) => b.amount - a.amount);
}

export function shiftMonth(month, delta) {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(year, index - 1 + delta, 1);
  return localDate(date).slice(0, 7);
}

export function makeDemo(month) {
  const details = [
    [1, 'income', '工资薪酬', 1800000, '这个月的努力，到账啦'],
    [2, 'expense', '居家生活', 280000, '房租 · 温暖的小窝'],
    [3, 'expense', '购物消费', 68900, '换季衣橱更新'],
    [5, 'expense', '餐饮美食', 16800, '和朋友的周末晚餐'],
    [7, 'expense', '交通出行', 12000, '地铁卡充值'],
    [9, 'expense', '学习成长', 15900, '给自己买了几本书'],
    [11, 'expense', '餐饮美食', 5860, '一碗热腾腾的拉面'],
    [13, 'income', '兼职副业', 240000, '设计项目尾款'],
    [14, 'expense', '购物消费', 32900, '日常好物补给'],
    [16, 'expense', '休闲娱乐', 12800, '周末看一场电影'],
    [18, 'expense', '餐饮美食', 24600, '家庭聚餐'],
    [20, 'expense', '医疗健康', 8600, '维生素与日常护理'],
    [22, 'expense', '餐饮美食', 3200, '今天也要好好吃早餐'],
    [23, 'expense', '交通出行', 3800, '下雨天打车回家'],
    [24, 'expense', '购物消费', 25900, '一双舒服的运动鞋'],
    [25, 'expense', '餐饮美食', 2850, '街角咖啡，开启好心情'],
  ];
  return details.map(([day, type, category, amount, note], index) => ({ id: `demo-${index}`, date: `${month}-${String(day).padStart(2, '0')}`, type, category, amount, note, demo: true }));
}

export function csvCell(value) {
  let text = String(value);
  // Spreadsheet applications must treat user notes as text, never formulas.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function readLedger(storage, key, month) {
  let snapshot = storage.getItem(key);
  if (snapshot === null) {
    snapshot = JSON.stringify(makeDemo(month));
    storage.setItem(key, snapshot);
  }
  const entries = JSON.parse(snapshot);
  if (!Array.isArray(entries) || entries.length > 100000) throw new Error('存储格式无效');
  const ids = new Set();
  for (const entry of entries) {
    validateEntry(entry);
    if (typeof entry.id !== 'string' || ids.has(entry.id)) throw new Error('账目编号无效');
    ids.add(entry.id);
  }
  return { entries, snapshot };
}

export function writeLedger(storage, key, expected, entries) {
  if (storage.getItem(key) !== expected) throw new Error('其他页面更新了账本，请核对后重试。');
  const snapshot = JSON.stringify(entries);
  storage.setItem(key, snapshot);
  return snapshot;
}
