const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const { createEditLog, addEvent, listFiles, fileDiff } = require('../src/diff/edit-log');
const { createStreamTranslator } = require('../src/panels/event-translator');

const tool = (id, name, input, final = true) => ({ kind: 'tool', id, name, input, final });

test('collects Edit, MultiEdit and Write; skips partial and other tools', () => {
  const log = createEditLog();
  assert.equal(addEvent(log, tool('1', 'Edit', {}, false)), false);
  assert.equal(addEvent(log, tool('2', 'Bash', { command: 'ls' })), false);
  assert.equal(addEvent(log, tool('3', 'Edit', { old_string: 'a' })), false); // no file_path
  addEvent(log, tool('4', 'Edit', { file_path: '/p/a.js', old_string: 'x', new_string: 'y' }));
  addEvent(log, tool('5', 'MultiEdit', { file_path: '/p/b.js', edits: [{ old_string: '1', new_string: '2' }, { old_string: '3', new_string: '4' }] }));
  addEvent(log, tool('6', 'Write', { file_path: '/p/a.js', content: 'new' }));
  assert.deepStrictEqual(listFiles(log), [{ path: '/p/a.js', count: 2 }, { path: '/p/b.js', count: 2 }]);
});

test('the same tool_use id is recorded once', () => {
  const log = createEditLog();
  const ev = tool('7', 'Edit', { file_path: '/p/a.js', old_string: 'x', new_string: 'y' });
  addEvent(log, ev);
  addEvent(log, ev);
  assert.equal(fileDiff(log, '/p/a.js').count, 1);
});

test('fileDiff aligns fragments under the same separators; Write starts from empty', () => {
  const log = createEditLog();
  addEvent(log, tool('1', 'Edit', { file_path: '/p/a.js', old_string: 'x', new_string: 'y' }));
  addEvent(log, tool('2', 'Write', { file_path: '/p/a.js', content: 'all' }));
  addEvent(log, tool('3', 'Edit', { file_path: '/p/other.js', old_string: 'q', new_string: 'r' }));
  const d = fileDiff(log, '/p/a.js');
  assert.equal(d.count, 2);
  assert.equal(d.left, '──── שינוי 1 ────\nx\n──── שינוי 2 ────\n');
  assert.equal(d.right, '──── שינוי 1 ────\ny\n──── שינוי 2 ────\nall');
});

test('fake CLI "edit" scenario feeds the log through the real translator', async () => {
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'dev', 'fake-claude.js'), '--permission-mode', 'bypassPermissions'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const translate = createStreamTranslator();
  const log = createEditLog();
  const done = new Promise((resolve) => {
    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      for (const ev of translate(msg)) addEvent(log, ev);
      if (msg.type === 'result') resolve();
    });
  });
  proc.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'edit please' }] } })}\n`);
  await done;
  proc.kill();
  const files = listFiles(log).map((f) => path.basename(f.path));
  assert.deepStrictEqual(files, ['demo.js', 'notes.md']);
});
