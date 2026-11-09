// Rule (2026-11-09): every text the extension itself sends to the CLI or the model is English; only
// what the user typed may be in another language. These tests feed ASCII input to the builders of
// model-bound text and check that no Hebrew comes out. Also: the editor-context blocks and the old
// Hebrew context line never reach the user's bubble, the title or the rewind list.
const test = require('node:test');
const assert = require('node:assert');
const chips = require('../src/tagging/chips');
const blocks = require('../src/diff/blocks');
const { stopPrompt } = require('../src/loop/loop-jobs');
const { buildBtwPrompt } = require('../src/cli/btw');
const { CliProcess } = require('../src/cli/process');
const content = require('../src/cli/content');
const cp = require('../src/checkpoints/checkpoints');
const { translateTranscript } = require('../src/history/transcript-events');

const HEBREW = /[\u0590-\u05FF]/;
const noHebrew = (s, what) => assert.ok(!HEBREW.test(s), `${what}: ${s}`);
const on = { attachOpenFile: true, attachSelection: true };

test('model-bound builders produce no Hebrew for ASCII input', () => {
  const ctx = { path: 'C:/p/app.js', name: 'app.js', lines: { start: 1, end: 3 }, selText: 'x'.repeat(9000) };
  const sel = chips.withContext('fix', chips.view(ctx, on, {}), ctx);
  assert.strictEqual(sel.context.length, 1);
  noHebrew(sel.context[0], 'selection context');
  const opened = { path: 'C:/p/app.js', name: 'app.js', lines: null, selText: '' };
  const file = chips.withContext('fix', chips.view(opened, on, {}), opened);
  assert.strictEqual(file.context.length, 1);
  noHebrew(file.context[0], 'file context');
  const folder = chips.withContext('go', chips.view(null, on, { manual: { path: 'C:/p/src', isDir: true } }), null);
  noHebrew(folder.context[0], 'folder context');
  const denied = blocks.decision('Edit', {}, { before: 'a' }, [{}], [false]);
  assert.strictEqual(denied.behavior, 'deny');
  noHebrew(denied.message, 'block review deny');
  noHebrew(stopPrompt('abcd1234'), '/loop stop');
  noHebrew(buildBtwPrompt([{ q: 'a', a: 'b' }], 'c'), '/btw prompt');
});

test('sendUserText: images, then each context block, then the user text, as separate blocks', () => {
  const sent = [];
  const fake = { send: (o) => sent.push(o) };
  CliProcess.prototype.sendUserText.call(fake, 'hello', [{ mediaType: 'image/png', data: 'AA' }], ['<ide_opened_file>x</ide_opened_file>']);
  assert.deepStrictEqual(sent[0].message.content, [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA' } },
    { type: 'text', text: '<ide_opened_file>x</ide_opened_file>' },
    { type: 'text', text: 'hello' },
  ]);
  CliProcess.prototype.sendUserText.call(fake, 'plain');
  assert.deepStrictEqual(sent[1].message.content, [{ type: 'text', text: 'plain' }]);
});

test('display: context blocks are hidden; the old Hebrew context line is stripped', () => {
  assert.ok(content.isInjectedText('<ide_opened_file>The user opened the file a.js in the IDE.</ide_opened_file>'));
  assert.ok(content.isInjectedText('<ide_selection>The user selected the lines 1 to 2 from a.js:\nx\n</ide_selection>'));
  const blocksNew = [
    { type: 'text', text: '<ide_opened_file>The user opened the file C:/p/a.js in the IDE.</ide_opened_file>' },
    { type: 'text', text: '<ide_selection>The user selected the lines 1 to 2 from C:/p/a.js:\nx\n</ide_selection>' },
    { type: 'text', text: 'תקן את זה' },
  ];
  assert.strictEqual(content.userTextFromEntry(blocksNew), 'תקן את זה');
  // Old transcripts: file line, folder line, lines block (with a blank line inside), then the text.
  const strip = content.stripLegacyContext;
  assert.strictEqual(strip('[הקשר מהעורך] הקובץ: @C:/p/a.js\n\nfix it'), 'fix it');
  assert.strictEqual(strip('[הקשר מהעורך] התיקייה: @"C:/my dir/src"\n\ngo'), 'go');
  assert.strictEqual(strip('[הקשר מהעורך] הקובץ: @C:/p/a.js\n[הקשר מהעורך] השורות שנבחרו: @C:/p/a.js#5-10\n```\na\n\nb\n```\n\nwhy\nnow?'), 'why\nnow?');
  assert.strictEqual(strip('[הקשר מהעורך] השורות שנבחרו: @C:/p/a.js#5\n```\n\n```\n\nq'), 'q');
  // Not the old format, or a broken one: unchanged.
  assert.strictEqual(strip('plain text'), 'plain text');
  assert.strictEqual(strip('[הקשר מהעורך] השורות שנבחרו: @a#1\n```\nno close'), '[הקשר מהעורך] השורות שנבחרו: @a#1\n```\nno close');
  assert.strictEqual(content.userTextFromEntry('[הקשר מהעורך] הקובץ: @C:/p/a.js\n\nhi'), 'hi');
  // A transcript entry of each kind shows only the typed text.
  const entries = [
    { type: 'user', uuid: 'u1', message: { role: 'user', content: blocksNew } },
    { type: 'user', uuid: 'u2', message: { role: 'user', content: [{ type: 'text', text: '[הקשר מהעורך] הקובץ: @C:/p/a.js\n\nold one' }] } },
  ];
  const users = translateTranscript(entries).filter((e) => e.kind === 'user').map((e) => e.text);
  assert.deepStrictEqual(users, ['תקן את זה', 'old one']);
  // The rewind list preview.
  const msg = { type: 'user', uuid: 'u3', message: { role: 'user', content: blocksNew } };
  assert.strictEqual(cp.checkpointFrom(msg).preview, 'תקן את זה');
});
