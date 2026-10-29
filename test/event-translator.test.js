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

test('tool results and the init line', () => {
  const t = createStreamTranslator();
  const [s] = t({ type: 'system', subtype: 'init', session_id: 'sid', model: 'm', permissionMode: 'plan', cwd: 'c' });
  assert.deepStrictEqual(s, { kind: 'session', sessionId: 'sid', model: 'm', permissionMode: 'plan', cwd: 'c' });
  const [r] = t({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu', content: 'out', is_error: false }] } });
  assert.deepStrictEqual(r, { kind: 'toolResult', toolUseId: 'tu', text: 'out', isError: false });
});
