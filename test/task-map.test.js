const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { CliProcess } = require('../src/cli/process');
const { createTaskMap, applyMessage, backgroundTasks } = require('../src/background/task-map');

const sys = (subtype, fields) => ({ type: 'system', subtype, ...fields });

test('ignores non-task lines', () => {
  const map = createTaskMap();
  assert.equal(applyMessage(map, sys('init', {})), false);
  assert.equal(applyMessage(map, { type: 'assistant' }), false);
  assert.equal(applyMessage(map, sys('task_started', {})), false);
});

test('started -> listed -> stopped (probe4 sequence)', () => {
  const map = createTaskMap();
  applyMessage(map, sys('task_started', { task_id: 't1', task_type: 'local_bash', description: 'ping', is_backgrounded: true }));
  applyMessage(map, sys('background_tasks_changed', { tasks: [{ task_id: 't1', task_type: 'local_bash', description: 'ping' }] }));
  assert.deepStrictEqual(backgroundTasks(map).map((t) => [t.id, t.running]), [['t1', true]]);
  applyMessage(map, sys('background_tasks_changed', { tasks: [] }));
  applyMessage(map, sys('task_updated', { task_id: 't1', patch: { status: 'killed' } }));
  applyMessage(map, sys('task_notification', { task_id: 't1', status: 'stopped', summary: 'done' }));
  const [t] = backgroundTasks(map);
  assert.equal(t.running, false);
  assert.equal(t.status, 'stopped');
  assert.equal(t.summary, 'done');
});

test('foreground tasks are tracked but not shown; running sort first', () => {
  const map = createTaskMap();
  applyMessage(map, sys('task_started', { task_id: 'fg', task_type: 'local_agent', is_backgrounded: false }));
  applyMessage(map, sys('background_tasks_changed', { tasks: [{ task_id: 'a' }, { task_id: 'b' }] }));
  applyMessage(map, sys('task_notification', { task_id: 'a', status: 'completed' }));
  assert.deepStrictEqual(backgroundTasks(map).map((t) => t.id), ['b', 'a']);
});

test('fake CLI: background task, then stop_task ends it', async () => {
  const proc = new CliProcess({
    claudePath: process.execPath,
    args: [path.join(__dirname, '..', 'dev', 'fake-claude.js'), '--permission-mode', 'bypassPermissions'],
    cwd: process.cwd(),
    env: process.env,
    log: () => {},
  });
  const map = createTaskMap();
  let resolveTurn;
  let resolveStopped;
  const turnDone = new Promise((r) => { resolveTurn = r; });
  const stopped = new Promise((r) => { resolveStopped = r; });
  proc.on('message', (m) => {
    applyMessage(map, m);
    if (m.type === 'result') resolveTurn();
    if (m.subtype === 'task_notification') resolveStopped();
  });
  await proc.request('initialize', {}, 10000);
  proc.sendUserText('run in background');
  await turnDone;
  const [running] = backgroundTasks(map);
  assert.equal(running.running, true);
  await proc.request('stop_task', { task_id: running.id }, 10000);
  await stopped;
  assert.equal(backgroundTasks(map)[0].running, false);
  proc.kill();
});
