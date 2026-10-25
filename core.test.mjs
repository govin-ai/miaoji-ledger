import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, validDate, validateEntry, monthlySummary, categorySummary, shiftMonth, makeDemo, csvCell, readLedger, writeLedger } from './core.mjs';

test('金额按整数分处理，拒绝零、负数、超长金额及多余小数', () => {
  assert.equal(parseAmount('0.01'), 1);
  assert.equal(parseAmount('12.30'), 1230);
  assert.equal(parseAmount('100'), 10000);
  for (const value of ['0', '-1', '1.001', '1e3', 'NaN', '', '1000000000']) assert.throws(() => parseAmount(value));
});
test('日期包含闰年和错误日期的验证', () => {
  assert.ok(validDate('2024-02-29'));
  for (const value of ['2026-02-29', '2026-13-01', '2026-04-31', '', '0000-01-01']) assert.equal(validDate(value), false);
});
test('分类必须与收入或支出匹配', () => {
  const entry = { type: 'expense', amount: 1200, date: '2026-10-01', category: '餐饮美食', note: '午餐' };
  assert.equal(validateEntry(entry), entry);
  assert.throws(() => validateEntry({ ...entry, type: 'income' }));
  assert.throws(() => validateEntry({ ...entry, amount: 1.5 }));
  assert.throws(() => validateEntry({ ...entry, note: 'x'.repeat(81) }));
});
test('按月隔离收支，分类合计只包含所选类型', () => {
  const entries = [
    { date: '2026-10-01', type: 'income', category: '工资薪酬', amount: 10001 },
    { date: '2026-10-02', type: 'expense', category: '餐饮美食', amount: 1001 },
    { date: '2026-10-03', type: 'expense', category: '餐饮美食', amount: 2 },
    { date: '2026-09-30', type: 'expense', category: '购物消费', amount: 90000 },
  ];
  const summary = monthlySummary(entries, '2026-10');
  assert.equal(summary.income, 10001);
  assert.equal(summary.expense, 1003);
  assert.equal(summary.balance, 8998);
  assert.equal(categorySummary(summary.rows, 'expense')[0].amount, 1003);
  assert.deepEqual(monthlySummary(entries, '2026-11'), { rows: [], income: 0, expense: 0, balance: 0 });
});
test('月份跨年及短月示例数据有效', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  for (const entry of makeDemo('2026-02')) assert.equal(validateEntry(entry), entry);
});
test('CSV 对引号和公式前缀做转义', () => {
  assert.equal(csvCell('hello,"world"'), '"hello,""world"""');
  assert.equal(csvCell('=SUM(1,1)'), '"\'=SUM(1,1)"');
});

const memoryStorage = initial => {
  let value = initial;
  return { getItem: () => value, setItem: (_key, next) => { value = next; } };
};
test('首次示例会保存，跨月重读不会生成新示例', () => {
  const storage = memoryStorage(null);
  const first = readLedger(storage, 'test', '2026-10');
  assert.equal(first.entries.length, 16);
  assert.deepEqual(readLedger(storage, 'test', '2026-11'), first);
});
test('新增、编辑、删除后的存储重读一致', () => {
  const storage = memoryStorage('[]');
  const entry = { id: 'test-1', date: '2026-10-01', type: 'expense', category: '餐饮美食', amount: 1234, note: '测试' };
  let snapshot = writeLedger(storage, 'test', '[]', [entry]);
  assert.equal(readLedger(storage, 'test', '2026-10').entries[0].amount, 1234);
  snapshot = writeLedger(storage, 'test', snapshot, [{ ...entry, amount: 5678 }]);
  assert.equal(readLedger(storage, 'test', '2026-10').entries[0].amount, 5678);
  writeLedger(storage, 'test', snapshot, []);
  assert.deepEqual(readLedger(storage, 'test', '2026-10').entries, []);
});
test('陈旧快照不能覆盖其他页面的新数据', () => {
  const storage = memoryStorage('[]');
  const fresh = writeLedger(storage, 'test', '[]', makeDemo('2026-10'));
  assert.throws(() => writeLedger(storage, 'test', '[]', []), /其他页面/);
  assert.equal(storage.getItem('test'), fresh);
});
test('损坏存储或写入失败不会覆盖原数据', () => {
  const corrupt = memoryStorage('{bad-json');
  assert.throws(() => readLedger(corrupt, 'test', '2026-10'));
  assert.equal(corrupt.getItem('test'), '{bad-json');
  const denied = { getItem: () => '[]', setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.throws(() => writeLedger(denied, 'test', '[]', makeDemo('2026-10')));
  assert.equal(denied.getItem('test'), '[]');
});
