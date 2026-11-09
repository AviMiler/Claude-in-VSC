const test = require('node:test');
const assert = require('node:assert');
const { createStreamTranslator } = require('../src/panels/event-translator');

const se = (event) => ({ type: 'stream_event', event, parent_tool_use_id: null });

test('streamed thinking, text and tool blocks are finalized under the same keys', () => {
  const t = createStreamTranslator();
  const ev = [
    se({ type: 'message_start', message: { id: 'm1' } }),
    se({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }),
    se({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } }),
    se({ type: 'content_block_start', index: 1, content_block: { type: 'text' } }),
    se({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hi' } }),
    se({ type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tu', name: 'Bash' } }),
    { type: 'assistant', message: { id: 'm1', model: 'x', content: [{ type: 'thinking', thinking: 'hmm' }] } },
    { type: 'assistant', message: { id: 'm1', model: 'x', content: [{ type: 'text', text: 'Hi' }] } },
    { type: 'assistant', message: { id: 'm1', model: 'x', content: [{ type: 'tool_use', id: 'tu', name: 'Bash', input: { command: 'ls' } }] } },
  ].flatMap(t);
  const keys = (kind) => ev.filter((e) => e.kind === kind).map((e) => e.key);
  assert.deepStrictEqual(keys('delta'), ['m1:0', 'm1:1']);
  assert.deepStrictEqual(keys('block'), ['m1:0', 'm1:1']);
  assert.deepStrictEqual(keys('tool'), ['m1:2', 'm1:2']);
  assert.deepStrictEqual(ev.filter((e) => e.kind === 'tool').pop().input, { command: 'ls' });
});

test('sub-agent traffic is hidden; synthetic messages are left to the result line', () => {
  const t = createStreamTranslator();
  assert.deepStrictEqual(t({ type: 'assistant', parent_tool_use_id: 'x', message: { content: [{ type: 'text', text: 'a' }] } }), []);
  assert.deepStrictEqual(t({ type: 'assistant', message: { model: '<synthetic>', content: [{ type: 'text', text: 'Not logged in' }] } }), []);
  const [r] = t({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in', duration_ms: 70 });
  assert.strictEqual(r.isError, true);
  assert.strictEqual(r.errorText, 'Not logged in');
});

test('init line carries skills and terminal-only commands when reported', () => {
  const t = createStreamTranslator();
  const [s] = t({ type: 'system', subtype: 'init', session_id: 's', skills: ['review'], terminal_slash_commands: ['doctor'] });
  assert.deepStrictEqual(s.skills, ['review']);
  assert.deepStrictEqual(s.terminalOnly, ['doctor']);
});

test('tool results and the init line', () => {
  const t = createStreamTranslator();
  const [s] = t({ type: 'system', subtype: 'init', session_id: 'sid', model: 'm', permissionMode: 'plan', cwd: 'c' });
  assert.deepStrictEqual(s, { kind: 'session', sessionId: 'sid', model: 'm', permissionMode: 'plan', cwd: 'c' });
  const [r] = t({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu', content: 'out', is_error: false }] } });
  assert.deepStrictEqual(r, { kind: 'toolResult', toolUseId: 'tu', text: 'out', isError: false });
});

test('a replayed user message shows no item for the injected editor-context blocks', () => {
  const t = createStreamTranslator();
  const ctxFile = '<ide_opened_file>The user opened the file a.js in the IDE. This may or may not be related to the current task.</ide_opened_file>';
  const ctxSel = '<ide_selection>The user selected the lines 1 to 2 from a.js:\nx\n\nThis may or may not be related to the current task.</ide_selection>';
  const replay = { type: 'user', uuid: 'u1', isReplay: true, message: { role: 'user', content: [
    { type: 'text', text: ctxFile }, { type: 'text', text: ctxSel }, { type: 'text', text: 'fix it' },
  ] } };
  assert.deepStrictEqual(t(replay), []);
  const withResult = { type: 'user', message: { content: [{ type: 'text', text: ctxFile }, { type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } };
  assert.deepStrictEqual(t(withResult), [{ kind: 'toolResult', toolUseId: 't1', text: 'ok', isError: false }]);
  // Injected text is never shown as the model's own text either.
  const asst = { type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: ctxFile }, { type: 'text', text: 'done' }] } };
  assert.deepStrictEqual(t(asst).map((e) => e.text), ['done']);
});
