const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listSessions, readSession } = require('../src/history/transcripts');
const { translateTranscript } = require('../src/history/transcript-events');
const { encodeCwd } = require('../src/util/paths');

const CWD = 'C:\\AI projects\\Work\\מסמכים\\demo';
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

function fixture() {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-test-'));
  const dir = path.join(config, 'projects', encodeCwd(CWD));
  fs.mkdirSync(dir, { recursive: true });
  const a = [
    { type: 'queue-operation', operation: 'enqueue' },
    { type: 'user', uuid: 'u0', isMeta: true, message: { role: 'user', content: '<system-reminder>ctx</system-reminder>' } },
    { type: 'user', uuid: 'u1', message: { role: 'user', content: 'סדר לי את הקוד בבקשה' } },
    { type: 'assistant', uuid: 'a1', message: { model: 'x', content: [{ type: 'thinking', thinking: '' }] } },
    { type: 'assistant', uuid: 'a2', message: { model: 'x', content: [{ type: 'text', text: 'בטח, **מתחיל**.' }] } },
    { type: 'assistant', uuid: 'a3', message: { model: 'x', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.js' } }] } },
    { type: 'user', uuid: 'u2', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'file body' }] }] } },
    { type: 'assistant', uuid: 's1', isSidechain: true, message: { model: 'x', content: [{ type: 'text', text: 'sub-agent text' }] } },
  ];
  const b = [
    { type: 'user', uuid: 'u1', message: { role: 'user', content: [{ type: 'text', text: '<command-name>/compact</command-name><command-args></command-args>' }] } },
    { type: 'custom-title', customTitle: 'כותרת מה-CLI', sessionId: ID_B },
  ];
  const write = (id, lines) => fs.writeFileSync(path.join(dir, `${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  write(ID_A, a);
  write(ID_B, b);
  fs.writeFileSync(path.join(dir, 'not-a-session.txt'), 'x');
  const past = new Date(Date.now() - 3600 * 1000);
  fs.utimesSync(path.join(dir, `${ID_A}.jsonl`), past, past);
  return { CLAUDE_CONFIG_DIR: config };
}

test('the cwd is encoded like the CLI does', () => {
  assert.strictEqual(encodeCwd('C:\\AI projects\\Work'), 'C--AI-projects-Work');
  assert.strictEqual(encodeCwd('C:\\a\\מסמכים'), 'C--a-------');
});

test('listSessions: newest first, CLI custom title wins, else first real user message', () => {
  const env = fixture();
  const items = listSessions(CWD, env);
  assert.deepStrictEqual(items.map((i) => i.id), [ID_B, ID_A]);
  assert.strictEqual(items[0].title, 'כותרת מה-CLI');
  assert.strictEqual(items[1].title, 'סדר לי את הקוד בבקשה');
});

test('listSessions on a folder with no transcripts is empty', () => {
  assert.deepStrictEqual(listSessions('C:\\nowhere', { CLAUDE_CONFIG_DIR: os.tmpdir() }), []);
});

test('translateTranscript skips meta, sidechain and empty thinking', () => {
  const events = translateTranscript(readSession(CWD, ID_A, fixture()));
  assert.deepStrictEqual(events.map((e) => e.kind), ['user', 'block', 'tool', 'toolResult']);
  assert.strictEqual(events[0].text, 'סדר לי את הקוד בבקשה');
  assert.strictEqual(events[3].text, 'file body');
});

test('slash-command entries show as the command the user typed', () => {
  const events = translateTranscript(readSession(CWD, ID_B, fixture()));
  assert.strictEqual(events[0].text, '/compact');
});

test('readSession rejects ids that are not session ids', () => {
  assert.throws(() => readSession(CWD, '..\\..\\secrets', fixture()));
});
