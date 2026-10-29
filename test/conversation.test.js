// Conversation against dev/fake-claude.js, with a stub `vscode` module and a fake webview.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

const vscodeStub = { workspace: { workspaceFolders: [{ uri: { fsPath: process.cwd() } }] } };
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? 'vscode-stub' : resolve.call(this, request, ...rest);
};
require.cache['vscode-stub'] = { id: 'vscode-stub', filename: 'vscode-stub', loaded: true, exports: vscodeStub };
const { Conversation } = require('../src/panels/conversation');

const FAKE_CMD = path.join(__dirname, '..', 'dev', 'fake-claude.cmd');
const FAKE_JS = path.join(__dirname, '..', 'dev', 'fake-claude.js');

function setup({ allowBypass = false } = {}) {
  const posted = [];
  const webview = { onDidReceiveMessage: () => ({ dispose() {} }), postMessage: (m) => posted.push(m) };
  // On Windows the .cmd wrapper is the realistic path; elsewhere run the script directly.
  const claudePath = process.platform === 'win32' ? FAKE_CMD : FAKE_JS;
  const services = {
    logger: { info() {}, warn() {}, debug() {} },
    settings: { get: () => ({ claudePath, allowDangerouslySkipPermissions: allowBypass }), onDidChange: () => ({ dispose() {} }) },
    registry: { findBySession: () => null },
  };
  const c = new Conversation({ webview, services, openInNewTab() {} });
  c.onReady();
  return { c, posted };
}

const results = (posted) => posted.filter((m) => m.type === 'events').flatMap((m) => m.events).filter((e) => e.kind === 'result');

function until(pred, ms = 8000) {
  return new Promise((res, rej) => {
    const start = Date.now();
    const tick = () => (pred() ? res() : Date.now() - start > ms ? rej(new Error('timeout')) : setTimeout(tick, 25));
    tick();
  });
}

async function stopScenario(variant) {
  process.env.FAKE_CLAUDE_INTERRUPT = variant;
  const { c, posted } = setup();
  try {
    c.send('slow please');
    await until(() => posted.some((m) => m.type === 'events' && m.events.some((e) => e.kind === 'delta')));
    c.interrupt();
    await until(() => results(posted).length > 0);
    return { c, result: results(posted)[0] };
  } finally {
    delete process.env.FAKE_CLAUDE_INTERRUPT;
    c.dispose();
  }
}

test('stop: a result with is_error is shown as stopped, not as an error', async () => {
  const { c, result } = await stopScenario('error');
  assert.strictEqual(result.interrupted, true);
  assert.strictEqual(result.isError, false);
  assert.strictEqual(c.busy, false);
});

test('stop: no result from the CLI still ends the turn locally', async () => {
  const { c, result } = await stopScenario('no-result');
  assert.strictEqual(result.interrupted, true);
  assert.strictEqual(c.busy, false);
});

test('bypass mode is refused without the setting and accepted with it', async () => {
  for (const allowBypass of [false, true]) {
    const { c, posted } = setup({ allowBypass });
    await until(() => posted.some((m) => m.type === 'commands'));
    c.setMode('bypassPermissions');
    await until(() => posted.some((m) => m.type === 'mode'));
    const mode = posted.find((m) => m.type === 'mode').value;
    assert.strictEqual(mode, allowBypass ? 'bypassPermissions' : 'default');
    assert.strictEqual(posted.some((m) => m.type === 'notice'), !allowBypass);
    c.dispose();
  }
});
