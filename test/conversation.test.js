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

// Port 1 refuses at once, so the model list falls back without real network.
function setup({ allowBypass = false, gatewayUrl = 'http://127.0.0.1:1' } = {}) {
  const posted = [];
  const webview = { onDidReceiveMessage: () => ({ dispose() {} }), postMessage: (m) => posted.push(m) };
  // On Windows the .cmd wrapper is the realistic path; elsewhere run the script directly.
  const claudePath = process.platform === 'win32' ? FAKE_CMD : FAKE_JS;
  const services = {
    logger: { info() {}, warn() {}, debug() {} },
    settings: { get: () => ({ claudePath, allowDangerouslySkipPermissions: allowBypass, gatewayUrl, modelDenylist: ['gemma3:27b'] }), onDidChange: () => ({ dispose() {} }) },
    registry: { findBySession: () => null },
  };
  const c = new Conversation({ webview, services });
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

test('renameSession sends /rename to the CLI, one line, and refuses without a session or while busy', () => {
  const { c } = setup();
  try {
    const sent = [];
    c.proc.sendUserText = (t) => sent.push(t);
    assert.strictEqual(c.renameSession('x'), false); // no session yet
    c.sessionId = '11111111-1111-1111-1111-111111111111';
    assert.strictEqual(c.renameSession('  שם\nחדש  '), true);
    assert.deepStrictEqual(sent, ['/rename שם חדש']);
    assert.strictEqual(c.busy, true);
    assert.strictEqual(c.renameSession('again'), false); // busy
    assert.strictEqual(c.renameSession('   '), false);
  } finally {
    c.dispose();
  }
});

test('onActivity is called after a post', () => {
  let n = 0;
  const webview = { onDidReceiveMessage: () => ({ dispose() {} }), postMessage() {} };
  const services = {
    logger: { info() {}, warn() {}, debug() {} },
    settings: { get: () => ({}), onDidChange: () => ({ dispose() {} }) },
    registry: { findBySession: () => null },
  };
  const c = new Conversation({ webview, services, onActivity: () => { n += 1; } });
  c.post({ type: 'x' });
  assert.strictEqual(n, 1);
  c.dispose();
});

// --- package D: model switch by restart, no-tools fallback, model list, context meter -------------

function initOf(proc) {
  return new Promise((res) => proc.on('message', (m) => { if (m.type === 'system' && m.subtype === 'init') res(m); }));
}

test('switching model restarts the CLI with --model, the three default-model variables and --resume', async () => {
  const { c, posted } = setup();
  try {
    await until(() => c.sessionId);
    const oldProc = c.proc;
    const session = c.sessionId;
    c.setModel('gpt-oss:20b');
    assert.notStrictEqual(c.proc, oldProc);
    const init = await initOf(c.proc);
    assert.strictEqual(init.model, 'gpt-oss:20b');
    assert.strictEqual(init.session_id, session);
    assert.deepStrictEqual(init.fake_default_models, ['gpt-oss:20b', 'gpt-oss:20b', 'gpt-oss:20b']);
    assert.ok(posted.some((m) => m.type === 'model' && m.value === 'gpt-oss:20b'));
  } finally {
    c.dispose();
  }
});

test('a "does not support tools" result returns to the previous model with a Hebrew notice', async () => {
  process.env.FAKE_CLAUDE_NO_TOOLS_MODEL = 'gemma3:27b';
  const { c, posted } = setup();
  try {
    await until(() => c.sessionId);
    c.setModel('gemma3:27b');
    c.send('hello');
    await until(() => c.model === 'default' && c.proc && !c.busy);
    assert.ok(posted.some((m) => m.type === 'notice' && /לא תומך בכלים/.test(m.text)));
  } finally {
    delete process.env.FAKE_CLAUDE_NO_TOOLS_MODEL;
    c.dispose();
  }
});

test('model and mode changes are refused during a turn', async () => {
  const { c, posted } = setup();
  try {
    await until(() => c.sessionId);
    const proc = c.proc;
    c.send('slow please');
    c.setModel('gpt-oss:20b');
    c.setMode('plan');
    assert.strictEqual(c.proc, proc);
    assert.strictEqual(c.model, 'default');
    assert.strictEqual(c.permissionMode, 'default');
    assert.strictEqual(posted.filter((m) => m.type === 'notice').length, 2);
  } finally {
    c.dispose();
  }
});

test('the model list comes from the gateway, filtered; the context meter follows get_context_usage', async () => {
  const http = require('http');
  const server = http.createServer((req, res) => {
    const body = {
      '/v1/models': { data: [{ id: 'qwen3.8:27b' }, { id: 'gemma3:27b' }, { id: 'gemma4:31b' }] },
      '/v1/model/info': { data: [{ model_name: 'gemma4:31b', litellm_params: { extra_body: { output_config: { format: {} } } } }] },
    }[req.url];
    res.writeHead(body ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body || {}));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { c, posted } = setup({ gatewayUrl: `http://127.0.0.1:${server.address().port}` });
  try {
    await until(() => posted.some((m) => m.type === 'models') && posted.some((m) => m.type === 'context'));
    const models = posted.find((m) => m.type === 'models').models.map((m) => m.value);
    assert.deepStrictEqual(models, ['default', 'qwen3.8:27b']);
    const ctx = posted.find((m) => m.type === 'context');
    assert.strictEqual(ctx.used, 23400);
  } finally {
    c.dispose();
    server.close();
  }
});

test('an unreachable gateway leaves only the current model in the list', async () => {
  const { c, posted } = setup();
  try {
    await until(() => posted.some((m) => m.type === 'models'));
    assert.deepStrictEqual(posted.find((m) => m.type === 'models').models.map((m) => m.value), ['default']);
  } finally {
    c.dispose();
  }
});
