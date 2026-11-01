const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { CliProcess } = require('../src/cli/process');
const { createLoopJobs, applyMessage, listJobs, stopPrompt } = require('../src/loop/loop-jobs');
const { startsSelfTurn } = require('../src/loop/self-turn');
const { parseCron, nextRun } = require('../webview/chat/cron-next');

const use = (id, name, input) => ({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id, name, input }] } });
const result = (id, text, toolUseResult, isError = false) => ({ type: 'user', parent_tool_use_id: null, tool_use_result: toolUseResult, message: { content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] } });

test('CronCreate adds a job in the probe4 shape; CronDelete removes it', () => {
  const s = createLoopJobs();
  applyMessage(s, use('c1', 'CronCreate', { cron: '*/1 * * * *', prompt: 'PING', recurring: true }));
  assert.ok(applyMessage(s, result('c1', 'Scheduled recurring job 25d4f4ac (Every minute).', { id: '25d4f4ac', humanSchedule: 'Every minute', recurring: true, durable: false }), 1000));
  assert.deepStrictEqual(listJobs(s), [{ id: '25d4f4ac', cron: '*/1 * * * *', humanSchedule: 'Every minute', prompt: 'PING', recurring: true, createdAt: 1000 }]);
  applyMessage(s, use('d1', 'CronDelete', { id: '25d4f4ac' }));
  assert.ok(applyMessage(s, result('d1', 'Cancelled job 25d4f4ac.', { id: '25d4f4ac' })));
  assert.strictEqual(listJobs(s).length, 0);
});

test('CronCreate without the structured result falls back to the text id', () => {
  const s = createLoopJobs();
  applyMessage(s, use('c1', 'CronCreate', { cron: '0 9 * * *', prompt: 'x', recurring: false }));
  applyMessage(s, result('c1', 'Scheduled one-shot job ab12 (At 09:00).'));
  assert.deepStrictEqual(listJobs(s).map((j) => [j.id, j.recurring]), [['ab12', false]]);
});

test('CronList replaces the list; a denied CronCreate changes nothing', () => {
  const s = createLoopJobs();
  applyMessage(s, use('c1', 'CronCreate', { cron: '* * * * *', prompt: 'x' }));
  assert.strictEqual(applyMessage(s, result('c1', 'denied', undefined, true)), false);
  applyMessage(s, use('l1', 'CronList', {}));
  applyMessage(s, result('l1', '...', { jobs: [{ id: 'j1', cron: '*/5 * * * *', humanSchedule: 'Every 5 minutes', prompt: 'p', recurring: true, durable: false }, { id: 'bad id;' }] }));
  assert.deepStrictEqual(listJobs(s).map((j) => j.id), ['j1']);
});

test('stopPrompt refuses ids that are not plain job ids', () => {
  assert.match(stopPrompt('25d4f4ac'), /CronDelete with id 25d4f4ac/);
  assert.strictEqual(stopPrompt('x; rm -rf'), null);
});

test('self-started turn: model output while no turn is open', () => {
  const start = { type: 'stream_event', event: { type: 'message_start', message: { id: 'm' } } };
  assert.strictEqual(startsSelfTurn(start, false), true);
  assert.strictEqual(startsSelfTurn(start, true), false);
  assert.strictEqual(startsSelfTurn({ type: 'system', subtype: 'init' }, false), false, 'init alone is not enough');
  assert.strictEqual(startsSelfTurn({ type: 'assistant', parent_tool_use_id: 'a', message: {} }, false), false, 'sub-agent lines do not count');
  assert.strictEqual(startsSelfTurn({ type: 'assistant', message: { model: '<synthetic>' } }, false), false);
});

test('cron parsing: steps, ranges, lists, names; invalid input gives null', () => {
  const c = parseCron('*/15 9-17 * jan,jul mon-fri');
  assert.deepStrictEqual([...c.minute], [0, 15, 30, 45]);
  assert.deepStrictEqual([...c.month], [1, 7]);
  assert.deepStrictEqual([...c.dow], [1, 2, 3, 4, 5]);
  for (const bad of ['', '* * * *', '61 * * * *', '* * * * * *', '5-1 * * * *', '*/0 * * * *']) assert.strictEqual(parseCron(bad), null, bad);
});

test('next run is the first matching minute after "from" (local time)', () => {
  const from = new Date(2026, 10, 1, 10, 7, 30); // Sun 1 Nov 2026 10:07:30
  assert.deepStrictEqual(nextRun('*/1 * * * *', from), new Date(2026, 10, 1, 10, 8));
  assert.deepStrictEqual(nextRun('*/5 * * * *', from), new Date(2026, 10, 1, 10, 10));
  assert.deepStrictEqual(nextRun('0 9 * * *', from), new Date(2026, 10, 2, 9, 0));
  assert.deepStrictEqual(nextRun('30 8 * * mon', from), new Date(2026, 10, 2, 8, 30));
  assert.deepStrictEqual(nextRun('0 0 1 1 *', from), new Date(2027, 0, 1, 0, 0));
  assert.deepStrictEqual(nextRun('0 12 15 * 0', from), new Date(2026, 10, 1, 12, 0), 'day-of-month OR day-of-week');
  assert.strictEqual(nextRun('0 0 31 2 *', from), null, 'never matches');
  assert.strictEqual(nextRun('nonsense', from), null);
});

test('fake CLI "loop" scenario: CronCreate, a self-started turn, then CronDelete', async () => {
  const proc = new CliProcess({
    claudePath: process.execPath,
    args: [path.join(__dirname, '..', 'dev', 'fake-claude.js'), '--permission-mode', 'bypassPermissions'],
    cwd: process.cwd(),
    env: { ...process.env, FAKE_CLAUDE_LOOP_MS: '150' },
    log: () => {},
  });
  const s = createLoopJobs();
  let busy = false;
  let selfTurns = 0;
  let onResult = null;
  proc.on('message', (m) => {
    if (startsSelfTurn(m, busy)) { busy = true; selfTurns++; }
    applyMessage(s, m);
    if (m.type === 'result') { busy = false; if (onResult) onResult(); }
  });
  const nextResult = () => new Promise((resolve) => { onResult = resolve; });
  await proc.request('initialize', {}, 10000);
  busy = true;
  proc.sendUserText('/loop 1m say PING');
  await nextResult();
  assert.deepStrictEqual(listJobs(s).map((j) => [j.id, j.cron]), [['fakejob1', '*/1 * * * *']]);
  await nextResult(); // the self-started turn
  assert.strictEqual(selfTurns, 1);
  busy = true;
  proc.sendUserText(stopPrompt('fakejob1'));
  await nextResult();
  proc.kill();
  assert.strictEqual(listJobs(s).length, 0);
  assert.strictEqual(selfTurns, 1, 'user turns are not counted as self-started');
});
