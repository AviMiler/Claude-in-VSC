const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { CliProcess } = require('../src/cli/process');
const { createAgentMap, applyMessage, displaySummary, listCards } = require('../src/agents/agent-map');

const call = (id, name, input, parent = null) => ({ type: 'assistant', parent_tool_use_id: parent, message: { content: [{ type: 'tool_use', id, name, input }] } });
const result = (id, content, parent = null, isError = false) => ({ type: 'user', parent_tool_use_id: parent, message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });
const sys = (subtype, fields) => ({ type: 'system', subtype, ...fields });

test('an Agent call makes a running card; its tool_result finishes it', () => {
  const m = createAgentMap();
  assert.deepStrictEqual(applyMessage(m, call('a1', 'Agent', { description: 'd', subagent_type: 'general-purpose', prompt: 'secret prompt' })), ['a1']);
  let [c] = listCards(m);
  assert.strictEqual(c.state, 'running');
  assert.strictEqual(c.subagentType, 'general-purpose');
  assert.ok(!JSON.stringify(c).includes('secret prompt'), 'the prompt is not kept');
  applyMessage(m, result('a1', 'answer'));
  [c] = listCards(m);
  assert.strictEqual(c.state, 'done');
  assert.strictEqual(c.summary, 'answer');
});

test('other top-level tools make no card', () => {
  const m = createAgentMap();
  assert.deepStrictEqual(applyMessage(m, call('b1', 'Bash', { command: 'ls' })), []);
  assert.strictEqual(listCards(m).length, 0);
});

test('sub-agent tools are grouped by parent_tool_use_id, nested ones into the root card', () => {
  const m = createAgentMap();
  applyMessage(m, call('a1', 'Agent', {}));
  applyMessage(m, call('g1', 'Glob', { pattern: '*' }, 'a1'));
  applyMessage(m, call('a2', 'Agent', { description: 'nested' }, 'a1'));
  applyMessage(m, call('r1', 'Read', { file_path: 'x'.repeat(500) }, 'a2'));
  applyMessage(m, result('g1', 'a.js', 'a1'));
  applyMessage(m, result('r1', 'boom', 'a2', true));
  const [c] = listCards(m);
  assert.strictEqual(listCards(m).length, 1, 'a nested Agent is a tool row, not a second card');
  assert.deepStrictEqual(c.tools.map((t) => [t.name, t.state]), [['Glob', 'ok'], ['Agent', 'running'], ['Read', 'err']]);
  assert.ok(c.tools[2].input.file_path.length <= 201, 'long inputs are cut');
});

test('lines for an unknown parent are ignored', () => {
  const m = createAgentMap();
  assert.deepStrictEqual(applyMessage(m, call('g1', 'Glob', {}, 'nobody')), []);
});

test('task_started / task_progress / task_notification fill the card (probe4 shapes)', () => {
  const m = createAgentMap();
  applyMessage(m, call('call_f356w7w0', 'Agent', { description: 'List files' }));
  applyMessage(m, sys('task_started', { task_id: 't1', tool_use_id: 'call_f356w7w0', subagent_type: 'general-purpose', is_backgrounded: false, spawn_depth: 1, task_type: 'local_agent' }));
  applyMessage(m, sys('task_progress', { task_id: 't1', tool_use_id: 'call_f356w7w0', usage: { total_tokens: 0, tool_uses: 2, duration_ms: 15386 }, last_tool_name: 'Bash' }));
  let [c] = listCards(m);
  assert.strictEqual(c.lastTool, 'Bash');
  assert.strictEqual(c.toolUses, 2);
  applyMessage(m, sys('task_notification', { task_id: 't1', tool_use_id: 'call_f356w7w0', status: 'completed', summary: 'the summary', usage: { tool_uses: 2, duration_ms: 35536 } }));
  applyMessage(m, result('call_f356w7w0', [{ type: 'text', text: '(no content)' }]));
  [c] = listCards(m);
  assert.strictEqual(c.state, 'done');
  assert.strictEqual(c.durationMs, 35536);
  assert.strictEqual(c.summary, 'the summary', 'the notification summary wins over "(no content)"');
});

test('a background agent stays running after its tool_result until the notification', () => {
  const m = createAgentMap();
  applyMessage(m, call('a1', 'Agent', { run_in_background: true }));
  applyMessage(m, result('a1', 'launched'));
  assert.strictEqual(listCards(m)[0].state, 'running');
  applyMessage(m, sys('task_updated', { task_id: 't9', tool_use_id: 'a1', patch: { status: 'killed' } }));
  assert.strictEqual(listCards(m)[0].state, 'stopped');
});

test('a non-agent task_started (local_bash) does not touch a card', () => {
  const m = createAgentMap();
  applyMessage(m, call('a1', 'Agent', {}));
  assert.deepStrictEqual(applyMessage(m, sys('task_started', { task_id: 'b', tool_use_id: 'a1', task_type: 'local_bash' })), []);
});

test('displaySummary skips the "(no content)" placeholder on both sides', () => {
  assert.strictEqual(displaySummary({ notificationSummary: '(no content)', resultText: '(no content)' }), '');
  assert.strictEqual(displaySummary({ notificationSummary: '(no content)', resultText: 'r' }), 'r');
});

test('an errored Agent result marks the card as error', () => {
  const m = createAgentMap();
  applyMessage(m, call('a1', 'Task', {}));
  applyMessage(m, result('a1', 'failed', null, true));
  assert.strictEqual(listCards(m)[0].state, 'error');
});

test('fake CLI "agent" scenario builds one finished card with its Glob and summary', async () => {
  const proc = new CliProcess({
    claudePath: process.execPath,
    args: [path.join(__dirname, '..', 'dev', 'fake-claude.js'), '--permission-mode', 'bypassPermissions'],
    cwd: process.cwd(),
    env: process.env,
    log: () => {},
  });
  const m = createAgentMap();
  const done = new Promise((resolve) => proc.on('message', (msg) => { applyMessage(m, msg); if (msg.type === 'result') resolve(); }));
  await proc.request('initialize', {}, 10000);
  proc.sendUserText('run an agent');
  await done;
  proc.kill();
  const cards = listCards(m);
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0].state, 'done');
  assert.deepStrictEqual(cards[0].tools.map((t) => [t.name, t.state]), [['Glob', 'ok']]);
  assert.strictEqual(cards[0].summary, 'נמצאו שני קבצים: a.js, b.js');
});
