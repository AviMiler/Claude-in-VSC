const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { CliProcess } = require('../src/cli/process');
const cp = require('../src/checkpoints/checkpoints');

const userMsg = (content, extra = {}) => ({ type: 'user', uuid: 'u1', message: { role: 'user', content }, ...extra });

test('checkpointArgs: replay flag always, fork flag on request', () => {
  assert.deepStrictEqual(cp.checkpointArgs(), ['--replay-user-messages']);
  assert.deepStrictEqual(cp.checkpointArgs({ fork: true }), ['--replay-user-messages', '--fork-session']);
  assert.equal(cp.CHECKPOINT_ENV.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING, '1');
});

test('checkpointFrom: replayed prompts only', () => {
  assert.equal(cp.checkpointFrom(userMsg([{ type: 'text', text: ' hi\n there ' }])).preview, 'hi there');
  assert.equal(cp.checkpointFrom(userMsg('plain')).preview, 'plain');
  assert.equal(cp.checkpointFrom(userMsg([{ type: 'tool_result', tool_use_id: 't' }])), null);
  assert.equal(cp.checkpointFrom(userMsg([{ type: 'text', text: 'x' }], { uuid: undefined })), null);
  assert.equal(cp.checkpointFrom(userMsg([{ type: 'text', text: 'x' }], { parent_tool_use_id: 't' })), null);
  assert.equal(cp.checkpointFrom({ type: 'assistant', uuid: 'a' }), null);
});

test('addCheckpoint ignores duplicates; filesChangedCount reads known shapes only', () => {
  const list = cp.createCheckpointList();
  assert.ok(cp.addCheckpoint(list, userMsg('a')));
  assert.equal(cp.addCheckpoint(list, userMsg('a')), null);
  assert.equal(list.items.length, 1);
  assert.equal(cp.filesChangedCount({ filesChanged: ['a', 'b'] }), 2);
  assert.equal(cp.filesChangedCount({ filesChanged: 3 }), 3);
  assert.equal(cp.filesChangedCount({}), null);
});

function startFake(env) {
  return new CliProcess({
    claudePath: process.execPath,
    args: [path.join(__dirname, '..', 'dev', 'fake-claude.js'), '--permission-mode', 'bypassPermissions', ...cp.checkpointArgs()],
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    log: () => {},
  });
}

test('fake CLI: replayed prompt gives a checkpoint that rewind_files accepts', async () => {
  const proc = startFake(cp.CHECKPOINT_ENV);
  const list = cp.createCheckpointList();
  const done = new Promise((resolve) => proc.on('message', (m) => { cp.addCheckpoint(list, m); if (m.type === 'result') resolve(); }));
  await proc.request('initialize', {}, 10000);
  proc.sendUserText('edit please');
  await done;
  assert.equal(list.items.length, 1);
  const dry = await proc.request('rewind_files', { user_message_id: list.items[0].id, dry_run: true }, 10000);
  assert.equal(cp.filesChangedCount(dry), 1);
  proc.kill();
});

test('fake CLI: rewind_files is refused without the environment variable', async () => {
  const proc = startFake({ CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '' });
  await proc.request('initialize', {}, 10000);
  await assert.rejects(proc.request('rewind_files', { user_message_id: 'x', dry_run: true }, 10000), /not enabled/);
  proc.kill();
});
