const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { CliProcess } = require('../src/cli/process');
const { createClaudeTasks, applyMessage, listTasks } = require('../src/tasks/claude-tasks');

const use = (id, name, input, extra = {}) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] }, ...extra });
const result = (id, content, toolUseResult, extra = {}) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] }, tool_use_result: toolUseResult, ...extra });

test('TaskCreate then TaskUpdate (probe4 shapes)', () => {
  const s = createClaudeTasks();
  assert.equal(applyMessage(s, use('a', 'TaskCreate', { subject: 'one', description: 'd' })), false);
  assert.equal(applyMessage(s, result('a', 'Task #1 created successfully: one', { task: { id: '1', subject: 'one' } })), true);
  applyMessage(s, use('b', 'TaskUpdate', { taskId: '1', status: 'in_progress' }));
  applyMessage(s, result('b', 'Updated task #1 status', { success: true, taskId: '1', updatedFields: ['status'], statusChange: { from: 'pending', to: 'in_progress' } }));
  assert.deepStrictEqual(listTasks(s), [{ id: '1', subject: 'one', status: 'in_progress' }]);
});

test('TaskCreate id falls back to the result text; camelCase result field accepted', () => {
  const s = createClaudeTasks();
  applyMessage(s, use('a', 'TaskCreate', { subject: 'two' }));
  applyMessage(s, result('a', [{ type: 'text', text: 'Task #7 created successfully: two' }], undefined));
  applyMessage(s, use('b', 'TaskUpdate', { taskId: '7', status: 'completed' }));
  applyMessage(s, { ...result('b', 'ok', undefined), toolUseResult: { success: true, statusChange: { to: 'completed' } } });
  assert.deepStrictEqual(listTasks(s), [{ id: '7', subject: 'two', status: 'completed' }]);
});

test('errors, failures, sub-agent traffic and unknown tool results change nothing', () => {
  const s = createClaudeTasks();
  applyMessage(s, use('a', 'TaskCreate', { subject: 'x' }));
  assert.equal(applyMessage(s, { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a', content: 'denied', is_error: true }] } }), false);
  applyMessage(s, use('b', 'TaskCreate', { subject: 'y' }, { parent_tool_use_id: 'agent' }));
  assert.equal(applyMessage(s, result('b', 'Task #2 created successfully: y', { task: { id: '2' } })), false);
  applyMessage(s, use('c', 'TaskUpdate', { taskId: '1', status: 'completed' }));
  assert.equal(applyMessage(s, result('c', 'no', { success: false })), false);
  assert.equal(applyMessage(s, result('zzz', 'other', {})), false);
  assert.equal(listTasks(s).length, 0);
});

test('TaskList replaces the whole list', () => {
  const s = createClaudeTasks();
  applyMessage(s, use('l', 'TaskList', {}));
  applyMessage(s, result('l', '...', { tasks: [{ id: '1', subject: 'a', status: 'completed', blockedBy: [] }, { id: '2', subject: 'b', status: 'weird' }] }));
  assert.deepStrictEqual(listTasks(s).map((t) => [t.id, t.status]), [['1', 'completed'], ['2', 'pending']]);
});

test('fake CLI "tasks" scenario feeds the list', async () => {
  const proc = new CliProcess({
    claudePath: process.execPath,
    args: [path.join(__dirname, '..', 'dev', 'fake-claude.js'), '--permission-mode', 'bypassPermissions'],
    cwd: process.cwd(),
    env: process.env,
    log: () => {},
  });
  const s = createClaudeTasks();
  const done = new Promise((resolve) => proc.on('message', (m) => { applyMessage(s, m); if (m.type === 'result') resolve(); }));
  await proc.request('initialize', {}, 10000);
  proc.sendUserText('make tasks');
  await done;
  proc.kill();
  assert.deepStrictEqual(listTasks(s).map((t) => [t.subject, t.status]), [['לקרוא את הקוד', 'completed'], ['לכתוב בדיקות', 'in_progress']]);
});
