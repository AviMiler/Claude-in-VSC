const test = require('node:test');
const assert = require('node:assert');
const d = require('../webview/chat/drawer-logic');

const open = [
  { id: 'c1', title: 'Fix bug', status: 'running' },
  { id: 'c2', title: 'שאלה', status: 'waiting' },
  { id: 'c3', title: 'Done', status: 'unread' },
];
const past = [{ id: 's1', title: 'Old fix', mtime: 0 }];

test('filters: past conversations count as finished; search is case-insensitive', () => {
  assert.deepStrictEqual(d.filterRows(open, past, 'running', '').open.map((r) => r.id), ['c1']);
  const finished = d.filterRows(open, past, 'finished', '');
  assert.deepStrictEqual(finished.open.map((r) => r.id), ['c3']);
  assert.strictEqual(finished.past.length, 1);
  assert.strictEqual(d.filterRows(open, past, 'waiting', '').past.length, 0);
  const found = d.filterRows(open, past, 'all', 'FIX');
  assert.deepStrictEqual([...found.open, ...found.past].map((r) => r.id), ['c1', 's1']);
});

test('day groups keep the list order', () => {
  const now = new Date(2026, 10, 2, 12).getTime();
  const hour = 3600e3;
  const groups = d.groupPast([
    { id: 'a', mtime: now - hour },
    { id: 'b', mtime: now - 20 * hour },
    { id: 'c', mtime: now - 3 * 24 * hour },
    { id: 'd', mtime: now - 30 * 24 * hour },
  ], now);
  assert.deepStrictEqual(groups.map((g) => g.label), ['היום', 'אתמול', 'השבוע', 'קודם']);
});

test('short times and the attention dot', () => {
  const now = 10 * 24 * 3600e3;
  assert.strictEqual(d.shortTime(now - 10e3, now), 'עכשיו');
  assert.strictEqual(d.shortTime(now - 5 * 60e3, now), '5 דק׳');
  assert.strictEqual(d.shortTime(now - 4 * 3600e3, now), '4 שע׳');
  assert.strictEqual(d.shortTime(now - 3 * 24 * 3600e3, now), '3 ימים');
  assert.strictEqual(d.attentionDot({ waiting: 1, unread: 2 }), 'waiting');
  assert.strictEqual(d.attentionDot({ waiting: 0, unread: 2 }), 'unread');
  assert.strictEqual(d.attentionDot({ waiting: 0, unread: 0 }), null);
});
