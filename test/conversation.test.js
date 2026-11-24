// Conversation against dev/fake-claude.js, with a stub `vscode` module and a fake webview.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');
const http = require('http');

const vscodeStub = { workspace: { workspaceFolders: [{ uri: { fsPath: process.cwd() } }] } };
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? 'vscode-stub' : resolve.call(this, request, ...rest);
};
require.cache['vscode-stub'] = { id: 'vscode-stub', filename: 'vscode-stub', loaded: true, exports: vscodeStub };
const { Conversation } = require('../src/panels/conversation');
const diagnostics = require('../src/tagging/diagnostics');
const { clearWindowCache } = require('../src/models/ollama');

const FAKE_CMD = path.join(__dirname, '..', 'dev', 'fake-claude.cmd');
const FAKE_JS = path.join(__dirname, '..', 'dev', 'fake-claude.js');

// Port 1 refuses at once, so the model list falls back without real network.
// ollamaUrl 'off' keeps the usage gauge from reading a real Ollama on this machine.
// explicitWindow: the user's own CLAUDE_CODE_MAX_CONTEXT_TOKENS (settings.get().explicitWindow), or null.
function setup({ defaultPermissionMode, allowBypass = false,gatewayUrl = 'http://127.0.0.1:1', environmentVariables, ollamaUrl = 'off', explicitWindow = null, pendingResume = null } = {}) {
  clearWindowCache(); // the real windows seen are kept in memory across conversations
  const posted = [];
  const webview = { onDidReceiveMessage: () => ({ dispose() {} }), postMessage: (m) => posted.push(m) };
  // On Windows the .cmd wrapper is the realistic path; elsewhere run the script directly.
  const claudePath = process.platform === 'win32' ? FAKE_CMD : FAKE_JS;
  const services = {
    logger: { info() {}, warn() {}, debug() {} },
    settings: { get: () => ({ claudePath, allowDangerouslySkipPermissions: allowBypass, defaultPermissionMode, gatewayUrl, ollamaUrl, modelDenylist: ['gemma3:27b'], environmentVariables, explicitWindow }), onDidChange: () => ({ dispose() {} }) },
    registry: { findBySession: () => null },
  };
  const c = new Conversation({ webview, services });
  if (pendingResume) c.pendingResume = pendingResume;
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

test('defaultPermissionMode sets the starting mode; bypass needs the allow setting; junk falls back', () => {
  const modeOf = (opts) => { const { c } = setup(opts); const m = c.permissionMode; c.dispose(); return m; };
  assert.strictEqual(modeOf({}), 'default');
  assert.strictEqual(modeOf({ defaultPermissionMode: 'plan' }), 'plan');
  assert.strictEqual(modeOf({ defaultPermissionMode: 'acceptEdits' }), 'acceptEdits');
  assert.strictEqual(modeOf({ defaultPermissionMode: 'bypassPermissions' }), 'default');
  assert.strictEqual(modeOf({ defaultPermissionMode: 'bypassPermissions', allowBypass: true }), 'bypassPermissions');
  assert.strictEqual(modeOf({ defaultPermissionMode: 'nonsense' }), 'default');
});

test('toggleFocusView posts toggleFocus; the focus command, shortcut and /focus entry exist', () => {
  const { c, posted } = setup();
  c.toggleFocusView();
  assert.ok(posted.some((m) => m.type === 'toggleFocus'));
  c.dispose();
  const fs = require('node:fs');
  const pkg = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '..', 'package.json'), 'utf8'));
  assert.ok(pkg.contributes.commands.some((x) => x.command === 'claude-local.focusView'));
  assert.ok(pkg.contributes.keybindings.some((x) => x.command === 'claude-local.focusView' && x.key === 'ctrl+alt+f'));
  const root = require('node:path').join(__dirname, '..', 'webview', 'chat');
  assert.match(fs.readFileSync(require('node:path').join(root, 'slash-menu.js'), 'utf8'), /name: 'focus'/);
  assert.match(fs.readFileSync(require('node:path').join(root, 'a11y.css'), 'utf8'), /\.tl-tool:not\(\.running\):not\(\.tl-todo\)/);
});

test('backgroundTool sends background_tasks with the tool_use_id; a refusal or backgrounded:false shows a notice', async () => {
  const { c, posted } = setup();
  const calls = [];
  const orig = c.proc;
  c.proc = { request: async (sub, payload) => { calls.push([sub, payload]); return { backgrounded: false }; } };
  await c.backgroundTool('toolu_1');
  assert.deepStrictEqual(calls, [['background_tasks', { tool_use_id: 'toolu_1' }]]);
  assert.strictEqual(posted.filter((m) => m.type === 'notice').length, 1);
  c.proc = { request: async () => ({ backgrounded: true }) };
  await c.backgroundTool('toolu_2');
  assert.strictEqual(posted.filter((m) => m.type === 'notice').length, 1);
  c.proc = { request: async () => { throw new Error('Unsupported control request subtype'); } };
  await c.backgroundTool('toolu_3');
  assert.strictEqual(posted.filter((m) => m.type === 'notice').length, 2);
  c.proc = orig;
  c.dispose();
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

// Rule 2026-11-09: what the extension itself sends to the model is English.
test('images without text: the model gets English text, the bubble only the image count', () => {
  const { c } = setup();
  try {
    const sent = [];
    c.proc.sendUserText = (...a) => sent.push(a);
    c.send('   ', [{ mediaType: 'image/png', data: 'AA' }]);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0][0], 'See the attached image.');
    assert.strictEqual(sent[0][1].length, 1);
    assert.deepStrictEqual(sent[0][2], []);
    assert.strictEqual(c.log.items[c.log.items.length - 1].ev.text, '[תמונות: 1]');
    c.busy = false;
    c.send('  ', []); // no text and no image: nothing is sent
    assert.strictEqual(sent.length, 1);
  } finally {
    c.dispose();
  }
});

// M-1 part b: the new errors of a file Claude edited go once with the next real send; a hidden prompt
// and a CLI command leave them pending. Bug 1: the CLI's compaction makes the chips count as not sent.
test('new diagnostics after an edit: one block with the next real send, kept across hidden and /command', async () => {
  const { c } = setup();
  try {
    const file = path.join(process.cwd(), 'no-such-dir', 'edited.js');
    const diags = { [file]: [{ severity: 'error', line: 1, column: 1, message: 'old' }] };
    c.diagnostics = diagnostics.createTracker({ read: (p) => (diags[p] || []).slice(), waitForChange: () => Promise.resolve() });
    const sent = [];
    c.proc.sendUserText = (...a) => sent.push(a);
    c.proc.emit('message', { type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'tu1', name: 'Edit', input: { file_path: file } }] } });
    diags[file] = [{ severity: 'error', line: 2, column: 1, message: 'old' }, { severity: 'error', line: 4, column: 3, message: 'Unexpected token.' }];
    c.proc.emit('message', { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }] } });
    c.busy = false; // the emitted CLI messages look like a turn the CLI started itself (loop-host)
    c.send('stop the loop', [], { hidden: true });
    assert.deepStrictEqual(sent[0][2], []);
    c.busy = false;
    c.send('/compact');
    assert.deepStrictEqual(sent[1][2], []);
    c.busy = false;
    c.send('fix it');
    await until(() => sent.length === 3);
    const diagBlocks = sent[2][2].filter((b) => b.startsWith('<ide_diagnostics>'));
    assert.strictEqual(diagBlocks.length, 1);
    assert.match(diagBlocks[0], /Unexpected token\./);
    assert.ok(!/: old/.test(diagBlocks[0]));
    assert.strictEqual(sent[2][0], 'fix it');
    c.busy = false;
    c.send('again');
    await until(() => sent.length === 4);
    assert.ok(!sent[3][2].some((b) => b.startsWith('<ide_diagnostics>'))); // once only
  } finally {
    c.dispose();
  }
});

// Verify finding: Stop pressed while the send waits for the language server must not send the message.
test('stop pressed during the diagnostics wait: the waiting message is not sent', async () => {
  const { c } = setup();
  try {
    const file = path.join(process.cwd(), 'no-such-dir', 'edited.js');
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    c.diagnostics = diagnostics.createTracker({ read: () => [], waitForChange: () => gate });
    const sent = [];
    c.proc.sendUserText = (...a) => sent.push(a);
    c.proc.emit('message', { type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'tu1', name: 'Edit', input: { file_path: file } }] } });
    c.proc.emit('message', { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }] } });
    c.busy = false;
    c.send('fix it'); // waits for the gate
    assert.strictEqual(sent.length, 0);
    c.stopping = true; // what interrupt() sets
    release();
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(sent.length, 0);
    c.stopping = false;
  } finally {
    c.dispose();
  }
});

test('the CLI compacting the conversation makes the file and selection count as not sent', () => {
  const { c } = setup();
  try {
    c.lastContextSent = { file: 'c:/p/a.js', sel: 'c:/p/a.js#1-2' };
    c.proc.emit('message', { type: 'system', subtype: 'status', status: 'compacting' });
    assert.deepStrictEqual(c.lastContextSent, {});
    c.lastContextSent = { file: 'c:/p/a.js' };
    c.proc.sendUserText = () => {};
    c.send('/compact keep the plan');
    assert.deepStrictEqual(c.lastContextSent, {});
  } finally {
    c.dispose();
  }
});

test('a permission denied without a reason answers the CLI in English', () => {
  const { c } = setup();
  try {
    const answers = [];
    const proc = { respond: (id, r) => answers.push(r) };
    c.pending.set('r1', { proc, req: { tool_name: 'Bash', input: {} }, msg: {} });
    c.answerPermission({ requestId: 'r1', behavior: 'deny' });
    assert.deepStrictEqual(answers, [{ behavior: 'deny', message: 'The user denied this request.' }]);
    c.pending.set('r2', { proc, req: { tool_name: 'Bash', input: {} }, msg: {} });
    c.answerPermission({ requestId: 'r2', behavior: 'deny', message: 'לא עכשיו' }); // the user's own words go as typed
    assert.strictEqual(answers[1].message, 'לא עכשיו');
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

// F-8: the user's ~/.claude/settings.json `env` names the old model for every alias; it beats the
// process environment, so the aliases must arrive through --settings.
test('switching model restarts the CLI with --model, every alias through --settings and --resume', async () => {
  process.env.FAKE_CLAUDE_USER_SETTINGS_ENV = JSON.stringify({
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'qwen3.8:27b', ANTHROPIC_DEFAULT_SONNET_MODEL: 'qwen3.8:27b', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'qwen3.8:27b',
  });
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
    assert.deepStrictEqual(init.fake_default_models, ['gpt-oss:20b', 'gpt-oss:20b', 'gpt-oss:20b', 'gpt-oss:20b']);
    assert.ok(posted.some((m) => m.type === 'model' && m.value === 'gpt-oss:20b'));
  } finally {
    delete process.env.FAKE_CLAUDE_USER_SETTINGS_ENV;
    c.dispose();
  }
});

// A fake Ollama. state.windows: model name -> context_length (may change between requests);
// state.expires_at: the unload time given for every entry; state.delay: ms before each answer.
function fakeOllama(state) {
  state.requests = [];
  const server = http.createServer((req, res) => {
    state.requests.push(`${req.method} ${req.url}`);
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: Object.entries(state.windows).map(([name, n]) => ({ name, model: name, context_length: n, ...(state.expires_at ? { expires_at: state.expires_at } : {}) })) }));
    }, state.delay || 0);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

// The window the running fake CLI itself reports (it reads CLAUDE_CODE_MAX_CONTEXT_TOKENS from --settings).
async function cliMax(c) {
  return (await c.proc.request('get_context_usage', {}, 5000)).maxTokens;
}

const contexts = (posted) => posted.filter((m) => m.type === 'context');
const notices = (posted, re) => posted.filter((m) => m.type === 'notice' && re.test(m.text));
const NAMED = { ANTHROPIC_MODEL: 'fake-model' }; // names the default model for the /api/ps lookup

// The window the CLI starts with (F-9: never 1M, the model's real window): with no Ollama read and no
// user value it is 64,000 and the gauge says it is the fallback.
test('without an Ollama read or a user value the CLI starts with 64,000 and the gauge shows the fallback', async () => {
  const { c, posted } = setup();
  try {
    const init = await initOf(c.proc);
    assert.strictEqual(init.model, 'fake-model');
    assert.strictEqual(await cliMax(c), 64000);
    await until(() => contexts(posted).length > 0);
    const ctx = contexts(posted)[0];
    assert.strictEqual(ctx.max, 64000);
    assert.strictEqual(ctx.source, 'fallback');
    assert.strictEqual(ctx.ollama, null, 'no load state without the read');
  } finally {
    c.dispose();
  }
});

test('a user window starts the CLI with it and the gauge shows it while Ollama is not read', async () => {
  const { c, posted } = setup({ explicitWindow: 48000 });
  try {
    await initOf(c.proc);
    assert.strictEqual(await cliMax(c), 48000);
    await until(() => contexts(posted).length > 0);
    assert.strictEqual(contexts(posted)[0].max, 48000);
    assert.strictEqual(contexts(posted)[0].source, 'explicit');
    assert.strictEqual(c.btwRunOptions().settings.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, '48000', '/btw starts with the same window');
  } finally {
    c.dispose();
  }
});

test('the start waits for /api/ps: the CLI gets the real window and the gauge shows it', async () => {
  const state = { windows: { 'fake-model': 32000 } };
  const { server, url } = await fakeOllama(state);
  const { c, posted } = setup({ ollamaUrl: url, environmentVariables: NAMED });
  try {
    assert.strictEqual(c.proc, null, 'not started before the window is known');
    await c.whenStarted;
    assert.ok(c.proc);
    assert.deepStrictEqual(state.requests.slice(0, 1), ['GET /api/ps']);
    assert.strictEqual(await cliMax(c), 32000);
    assert.strictEqual(c.btwRunOptions().settings.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, '32000');
    await until(() => contexts(posted).length > 0);
    const a = contexts(posted)[0];
    assert.strictEqual(a.max, 32000);
    assert.strictEqual(a.source, 'ollama');
    assert.ok(Array.isArray(a.categories));
    assert.strictEqual(notices(posted, /החלון האמיתי|הגדרתם חלון/).length, 0, 'the CLI got the real window: nothing to say');
  } finally {
    c.dispose();
    server.close();
  }
});

test('Ollama unreachable: the CLI starts at once with 64,000 and the gauge shows the fallback', async () => {
  const { c, posted } = setup({ ollamaUrl: 'http://127.0.0.1:1', environmentVariables: NAMED });
  try {
    await c.whenStarted;
    assert.strictEqual(await cliMax(c), 64000);
    await until(() => contexts(posted).length > 0);
    assert.strictEqual(contexts(posted)[0].max, 64000);
    assert.strictEqual(contexts(posted)[0].source, 'fallback');
    assert.strictEqual(contexts(posted)[0].ollama, null, 'the load state is hidden');
  } finally {
    c.dispose();
  }
});

test('a user window wins for the CLI while the gauge shows the real one, with one notice (N1)', async () => {
  const state = { windows: { 'fake-model': 32000 } };
  const { server, url } = await fakeOllama(state);
  const { c, posted } = setup({ ollamaUrl: url, environmentVariables: NAMED, explicitWindow: 48000 });
  try {
    await c.whenStarted;
    assert.strictEqual(await cliMax(c), 48000);
    await until(() => contexts(posted).length > 0);
    assert.strictEqual(contexts(posted)[0].max, 32000);
    assert.strictEqual(contexts(posted)[0].source, 'ollama');
    const n = notices(posted, /הגדרתם חלון/);
    assert.strictEqual(n.length, 1, 'once per process, not again after the result');
    assert.strictEqual(n[0].text, 'הגדרתם חלון של 48,000 אסימונים, אבל החלון האמיתי של המודל ב-Ollama הוא 32,000. נשאר הערך שהגדרתם.');
  } finally {
    c.dispose();
    server.close();
  }
});

test('a window that changed in Ollama after the start is reported once after a result (N2) and applies at the next start', async () => {
  const state = { windows: { 'fake-model': 32000 } };
  const { server, url } = await fakeOllama(state);
  const { c, posted } = setup({ ollamaUrl: url, environmentVariables: NAMED });
  try {
    await c.whenStarted;
    await until(() => contexts(posted).length > 0);
    assert.strictEqual(notices(posted, /החלון האמיתי/).length, 0);
    state.windows['fake-model'] = 16000;
    c.send('hello');
    await until(() => contexts(posted).length > 1 && results(posted).length > 0);
    const last = contexts(posted)[1];
    assert.strictEqual(last.max, 16000);
    const n = notices(posted, /החלון האמיתי/);
    assert.strictEqual(n.length, 1);
    assert.strictEqual(n[0].text, 'החלון האמיתי של המודל הוא 16,000 אסימונים (Claude Code הופעל עם 32,000). השינוי יחול מההפעלה הבאה.');
    assert.strictEqual(await cliMax(c), 32000, 'the running process keeps what it started with');
    c.send('again');
    await until(() => contexts(posted).length > 2);
    assert.strictEqual(notices(posted, /החלון האמיתי/).length, 1, 'the same text is not repeated for this process');
  } finally {
    c.dispose();
    server.close();
  }
});

test('a model switch waits for the new model\'s window and restarts the CLI with it', async () => {
  const state = { windows: { 'fake-model': 32000, 'gpt-oss:20b': 16000 } };
  const { server, url } = await fakeOllama(state);
  const { c } = setup({ ollamaUrl: url, environmentVariables: NAMED });
  try {
    await c.whenStarted;
    await until(() => c.sessionId);
    const oldProc = c.proc;
    const session = c.sessionId;
    const pending = c.setModel('gpt-oss:20b');
    assert.strictEqual(c.proc, null, 'killed now, restarted once the window is read');
    await pending;
    assert.ok(c.proc && c.proc !== oldProc);
    const init = await initOf(c.proc);
    assert.strictEqual(init.model, 'gpt-oss:20b');
    assert.strictEqual(init.session_id, session);
    assert.strictEqual(await cliMax(c), 16000);
  } finally {
    c.dispose();
    server.close();
  }
});

// Counts the CLI processes a conversation starts from now on.
function countStarts(c) {
  const counter = { n: 0 };
  const orig = c.startProcess.bind(c);
  c.startProcess = (...args) => {
    counter.n += 1;
    return orig(...args);
  };
  return counter;
}

test('a switch changed again while it waited (A -> B -> A) ends with exactly one process, on the last choice', async () => {
  const state = { windows: { 'fake-model': 32000, 'gpt-oss:20b': 16000 }, delay: 0 };
  const { server, url } = await fakeOllama(state);
  const { c } = setup({ ollamaUrl: url, environmentVariables: NAMED });
  try {
    await c.whenStarted;
    await until(() => c.sessionId);
    const starts = countStarts(c);
    state.delay = 150;
    const first = c.setModel('gpt-oss:20b');
    c.setModel('default');
    assert.strictEqual(c.model, 'default');
    await first;
    assert.strictEqual(starts.n, 1);
    assert.ok(c.proc);
    assert.strictEqual((await initOf(c.proc)).model, 'fake-model');
    assert.strictEqual(await cliMax(c), 32000, 'with the window of the model chosen last');
  } finally {
    c.dispose();
    server.close();
  }
});

test('a switch changed to a third model while it waited starts with that model\'s window, not the first one\'s', async () => {
  const state = { windows: { 'fake-model': 32000, 'gpt-oss:20b': 16000, 'other:7b': 8000 }, delay: 0 };
  const { server, url } = await fakeOllama(state);
  const { c } = setup({ ollamaUrl: url, environmentVariables: NAMED });
  try {
    await c.whenStarted;
    await until(() => c.sessionId);
    const starts = countStarts(c);
    state.delay = 150;
    const first = c.setModel('gpt-oss:20b');
    c.setModel('other:7b'); // its window was never read before
    await first;
    assert.strictEqual(starts.n, 1);
    assert.strictEqual((await initOf(c.proc)).model, 'other:7b');
    assert.strictEqual(await cliMax(c), 8000);
  } finally {
    c.dispose();
    server.close();
  }
});

test('a switch waiting for /api/ps starts nothing once the conversation was closed', async () => {
  const state = { windows: { 'fake-model': 32000, 'gpt-oss:20b': 16000 }, delay: 0 };
  const { server, url } = await fakeOllama(state);
  const { c } = setup({ ollamaUrl: url, environmentVariables: NAMED });
  try {
    await c.whenStarted;
    await until(() => c.sessionId);
    const starts = countStarts(c);
    state.delay = 150;
    const pending = c.setModel('gpt-oss:20b');
    c.dispose();
    await pending;
    assert.strictEqual(starts.n, 0);
    assert.strictEqual(c.proc, null);
  } finally {
    server.close();
  }
});

test('a send while a switch waits for /api/ps starts the one process, and the switch leaves it alone', async () => {
  const state = { windows: { 'fake-model': 32000, 'gpt-oss:20b': 16000 }, delay: 0 };
  const { server, url } = await fakeOllama(state);
  const { c, posted } = setup({ ollamaUrl: url, environmentVariables: NAMED });
  try {
    await c.whenStarted;
    await until(() => c.sessionId);
    const starts = countStarts(c);
    state.delay = 300;
    const pending = c.setModel('gpt-oss:20b');
    c.send('hello');
    const started = c.proc;
    assert.ok(started, 'the send started it on the new model');
    await pending;
    assert.strictEqual(c.proc, started);
    assert.strictEqual(starts.n, 1);
    await until(() => results(posted).length > 0);
    assert.strictEqual(c.busy, false);
  } finally {
    c.dispose();
    server.close();
  }
});

test('the default model is found by the name the CLI reported, and the next start uses the window cached under it', async () => {
  const fs = require('fs');
  const os = require('os');
  const emptyConfig = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-noconfig-')); // no ~/.claude/settings.json env on this machine
  const saved = { dir: process.env.CLAUDE_CONFIG_DIR, model: process.env.ANTHROPIC_MODEL };
  process.env.CLAUDE_CONFIG_DIR = emptyConfig;
  delete process.env.ANTHROPIC_MODEL;
  const state = { windows: { 'fake-model': 32000, 'gpt-oss:20b': 16000 } };
  const { server, url } = await fakeOllama(state);
  const { c, posted } = setup({ ollamaUrl: url }); // no ANTHROPIC_MODEL anywhere
  try {
    await c.whenStarted;
    assert.deepStrictEqual(state.requests, [], 'the default model has no name yet: nothing to look up before the start');
    assert.strictEqual(await cliMax(c), 64000);
    await until(() => contexts(posted).length > 0);
    const first = contexts(posted)[0];
    assert.strictEqual(first.source, 'ollama', 'found by what get_context_usage reported');
    assert.strictEqual(first.max, 32000);
    assert.deepStrictEqual(first.ollama, { loaded: true, until: null, permanent: false });
    await until(() => c.sessionId && !c.busy);
    await c.setModel('gpt-oss:20b');
    await c.setModel('default');
    assert.strictEqual(c.launch.source, 'cached');
    assert.strictEqual(await cliMax(c), 32000, 'the new default-model process got the real window');
  } finally {
    c.dispose();
    server.close();
    if (saved.dir === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved.dir;
    if (saved.model !== undefined) process.env.ANTHROPIC_MODEL = saved.model;
    fs.rmSync(emptyConfig, { recursive: true, force: true });
  }
});

test('after the "applies at the next start" notice, a restart gets the new window and the notice is not repeated', async () => {
  const state = { windows: { 'fake-model': 32000, 'gpt-oss:20b': 8000 } };
  const { server, url } = await fakeOllama(state);
  const { c, posted } = setup({ ollamaUrl: url, environmentVariables: NAMED });
  try {
    await c.whenStarted;
    await until(() => contexts(posted).length > 0);
    state.windows['fake-model'] = 16000;
    c.send('hello');
    await until(() => contexts(posted).length > 1 && !c.busy);
    assert.strictEqual(notices(posted, /החלון האמיתי/).length, 1);
    assert.strictEqual(await cliMax(c), 32000, 'the running process still has the old window');
    await c.setModel('gpt-oss:20b');
    await c.setModel('default');
    assert.strictEqual(await cliMax(c), 16000, 'the next start applies the new window');
    await until(() => contexts(posted).length > 2);
    assert.strictEqual(contexts(posted).at(-1).max, 16000);
    assert.strictEqual(notices(posted, /החלון האמיתי/).length, 1, 'nothing stale or repeated once the window matches');
  } finally {
    c.dispose();
    server.close();
  }
});

test('a send while the start waits for /api/ps starts the process once, with the cached or fallback window', async () => {
  const state = { windows: { 'fake-model': 32000 }, delay: 300 };
  const { server, url } = await fakeOllama(state);
  const { c, posted } = setup({ ollamaUrl: url, environmentVariables: NAMED });
  try {
    c.send('hello');
    const started = c.proc;
    assert.ok(started, 'the send started it');
    await c.whenStarted;
    assert.strictEqual(c.proc, started, 'the deferred start did not start a second process');
    await until(() => results(posted).length > 0);
    assert.strictEqual(await cliMax(c), 64000);
  } finally {
    c.dispose();
    server.close();
  }
});

// A resume must not wait for /api/ps: a send during the wait would start a new session that the
// late resume then killed (verify finding), losing the message and leaving the turn busy.
test('a resumed session loads at once even while /api/ps is slow, and a send goes to that session', async () => {
  const fs = require('fs');
  const os = require('os');
  const { encodeCwd } = require('../src/util/paths');
  const ID = '11111111-2222-4333-8444-555555555555';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-resume-'));
  const projectDir = path.join(dir, 'projects', encodeCwd(process.cwd()));
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, `${ID}.jsonl`), '');
  const savedDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = dir;
  const state = { windows: { 'fake-model': 32000 }, delay: 400 };
  const { server, url } = await fakeOllama(state);
  const { c, posted } = setup({ ollamaUrl: url, environmentVariables: NAMED, pendingResume: ID });
  try {
    assert.ok(c.proc, 'loadSession started the process inside onReady');
    assert.strictEqual(c.sessionId, ID);
    assert.strictEqual(c.pendingResume, null);
    assert.ok(posted.some((m) => m.type === 'sessionLoaded' && m.id === ID));
    const proc = c.proc;
    c.send('hello');
    assert.strictEqual(c.proc, proc, 'the send used the resumed process');
    await c.whenStarted;
    assert.strictEqual(c.proc, proc, 'nothing killed or replaced it later');
    await until(() => results(posted).length > 0);
    assert.strictEqual(c.busy, false);
    assert.strictEqual(c.sessionId, ID);
    assert.strictEqual(results(posted)[0].isError, false);
  } finally {
    c.dispose();
    server.close();
    if (savedDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = savedDir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('context.ollama: loaded until a time, permanent, not loaded, or null when Ollama is off', async () => {
  const soon = new Date(Date.now() + 3600e3).toISOString();
  const cases = [
    { name: 'loaded', state: { windows: { 'fake-model': 32000 }, expires_at: soon }, want: { loaded: true, until: Date.parse(soon), permanent: false } },
    { name: 'permanent', state: { windows: { 'fake-model': 32000 }, expires_at: '2318-02-01T00:00:00Z' }, want: { loaded: true, until: Date.parse('2318-02-01T00:00:00Z'), permanent: true } },
    { name: 'not loaded', state: { windows: {} }, want: { loaded: false } },
  ];
  for (const { name, state, want } of cases) {
    const { server, url } = await fakeOllama(state);
    const { c, posted } = setup({ ollamaUrl: url, environmentVariables: NAMED });
    try {
      await until(() => contexts(posted).length > 0);
      assert.deepStrictEqual(contexts(posted)[0].ollama, want, name);
    } finally {
      c.dispose();
      server.close();
    }
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

test('/plan always gives a visible Hebrew result (F-5)', async () => {
  const { c, posted } = setup();
  try {
    await until(() => c.sessionId);
    const notices = () => posted.filter((m) => m.type === 'notice');
    c.planCommand(true); // no plan yet
    assert.strictEqual(notices().length, 1);
    c.planCommand(false); // idle: switches and says so
    assert.strictEqual(notices().length, 2);
    assert.strictEqual(c.permissionMode, 'plan');
    c.planCommand(false); // already in plan mode: still says so
    assert.strictEqual(notices().length, 3);
    c.send('slow please');
    c.planCommand(false); // busy: setMode refuses with a notice
    assert.strictEqual(notices().length, 4);
  } finally {
    c.dispose();
  }
});

test('the model list comes from the gateway, filtered; the context meter follows get_context_usage', async () => {
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
