const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { openProjectClaudeMd, TEMPLATE } = require('../src/panels/claude-md');

function deps({ exists = false, answer = true, writeFails = false } = {}) {
  const log = { opened: [], written: [], notices: [], asked: 0 };
  return {
    log,
    exists: () => exists,
    write: (p, t) => { if (writeFails) throw new Error('denied'); log.written.push([p, t]); },
    open: (p) => log.opened.push(p),
    ask: async () => { log.asked++; return answer; },
    notice: (t) => log.notices.push(t),
  };
}

test('an existing CLAUDE.md is opened without asking', async () => {
  const d = deps({ exists: true });
  await openProjectClaudeMd('/proj', false, d);
  assert.deepStrictEqual(d.log.opened, [path.join('/proj', 'CLAUDE.md')]);
  assert.strictEqual(d.log.asked, 0);
});

test('a missing one is created only after a yes, then opened', async () => {
  const yes = deps({ answer: true });
  await openProjectClaudeMd('/proj', false, yes);
  assert.deepStrictEqual(yes.log.written, [[path.join('/proj', 'CLAUDE.md'), TEMPLATE]]);
  assert.strictEqual(yes.log.opened.length, 1);
  const no = deps({ answer: false });
  await openProjectClaudeMd('/proj', false, no);
  assert.deepStrictEqual(no.log.written, []);
  assert.deepStrictEqual(no.log.opened, []);
});

test('no folder and a failed write give a notice, not a crash', async () => {
  const a = deps();
  await openProjectClaudeMd('/proj', true, a);
  assert.strictEqual(a.log.notices.length, 1);
  const b = deps({ writeFails: true });
  await openProjectClaudeMd('/proj', false, b);
  assert.match(b.log.notices[0], /denied/);
  assert.deepStrictEqual(b.log.opened, []);
});
