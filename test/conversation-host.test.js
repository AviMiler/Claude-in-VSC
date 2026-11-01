// ConversationHost (one place, several conversations) against dev/fake-claude.js, with a stub
// `vscode` module, a fake webview and the real registry. F-2: "new conversation" while one runs.
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
const { ConversationHost } = require('../src/panels/conversation-host');
const { createRegistry } = require('../src/panels/panel-registry');

const claudePath = path.join(__dirname, '..', 'dev', process.platform === 'win32' ? 'fake-claude.cmd' : 'fake-claude.js');

function setup() {
  const posted = [];
  const logs = [];
  let handler = null;
  const webview = {
    onDidReceiveMessage: (fn) => { handler = fn; return { dispose() {} }; },
    postMessage: (m) => posted.push(m),
  };
  const services = {
    logger: { info: (tag, t) => logs.push(`[${tag}] ${t}`), warn() {}, debug() {} },
    settings: { get: () => ({ claudePath, gatewayUrl: 'http://127.0.0.1:1', modelDenylist: [] }), onDidChange: () => ({ dispose() {} }) },
    registry: createRegistry(),
  };
  const states = [];
  const host = new ConversationHost({ services, kind: 'sidebar', revealPlace() {}, isVisible: () => true, onState: (s) => states.push(s) });
  host.bind(webview);
  const send = (m) => handler(m);
  send({ type: 'ready' });
  return { host, posted, logs, send, states };
}

function until(pred, ms = 8000) {
  return new Promise((res, rej) => {
    const start = Date.now();
    const tick = () => (pred() ? res() : Date.now() - start > ms ? rej(new Error('timeout')) : setTimeout(tick, 25));
    tick();
  });
}

const hasDelta = (posted) => posted.some((m) => m.type === 'events' && m.events.some((e) => e.kind === 'delta'));

test('new conversation while one runs: a second conversation opens, the first keeps running hidden', async () => {
  const { host, posted, logs, send } = setup();
  try {
    const first = host.current;
    await until(() => first.sessionId);
    send({ type: 'send', text: 'slow please' });
    await until(() => hasDelta(posted));
    const firstProc = first.proc;
    send({ type: 'newConversation', ui: { draft: 'טיוטה', queue: [] } });

    assert.strictEqual(host.conversations.size, 2);
    assert.notStrictEqual(host.current, first);
    assert.strictEqual(first.webview, null);
    assert.strictEqual(first.proc, firstProc, 'the running process is not killed');
    assert.strictEqual(first.busy, true);
    assert.ok(logs.some((l) => l.startsWith('[session] new conversation') && l.includes(`running in background: ${first.id}`)));
    assert.ok(logs.some((l) => l.includes(`switch ${first.id} -> ${host.current.id} (${first.id} keeps running in the background`)));

    // Hidden, the first one finishes: nothing more is painted for it, and it is marked unread.
    const before = posted.length;
    await until(() => !first.busy, 20000);
    assert.strictEqual(first.unread, true);
    // The visible (second) conversation is idle, so any painted result would be the hidden one's.
    const painted = posted.slice(before).filter((m) => m.type === 'events' && m.events.some((e) => e.kind === 'result' || e.kind === 'delta'));
    assert.strictEqual(painted.length, 0, 'a hidden conversation paints nothing');
    assert.ok(posted.some((m) => m.type === 'notice' && /סיימה/.test(m.text)));

    // Switching back redraws it from memory, with its draft.
    send({ type: 'switchConversation', id: first.id, ui: { draft: '', queue: [] } });
    const restore = posted.filter((m) => m.type === 'restore').pop();
    assert.strictEqual(restore.id, first.id);
    assert.strictEqual(restore.ui.draft, 'טיוטה');
    assert.deepStrictEqual(restore.sent, ['slow please']);
    assert.ok(restore.items.some((i) => i.ev && i.ev.kind === 'result'));
    assert.strictEqual(first.unread, false);
  } finally {
    host.dispose();
  }
});

test('a permission request of a hidden conversation stays pending and is drawn after the switch', async () => {
  const { host, posted, logs, send } = setup();
  try {
    const first = host.current;
    await until(() => first.sessionId);
    send({ type: 'send', text: 'tool please' });
    send({ type: 'newConversation' });
    await until(() => first.pending.size === 1);
    assert.ok(logs.some((l) => l.includes(`background conversation ${first.id} waits for permission`)));
    const states = posted.filter((m) => m.type === 'conversationStates').pop();
    assert.strictEqual(states.open.find((r) => r.id === first.id).status, 'waiting');
    assert.strictEqual(states.attention.waiting, 1);

    send({ type: 'switchConversation', id: first.id });
    const restore = posted.filter((m) => m.type === 'restore').pop();
    assert.strictEqual(restore.permissions.length, 1);
    send({ type: 'permissionAnswer', requestId: restore.permissions[0].requestId, behavior: 'allow' });
    await until(() => !first.busy);
    assert.strictEqual(first.pending.size, 0);
  } finally {
    host.dispose();
  }
});

test('closing the visible conversation shows another; closing the last one opens a new one', async () => {
  const { host, send } = setup();
  try {
    const a = host.current;
    const b = host.newConversation();
    send({ type: 'closeConversation', id: b.id });
    assert.strictEqual(host.current, a);
    assert.strictEqual(b.disposed, true);
    send({ type: 'closeConversation', id: a.id });
    assert.strictEqual(host.conversations.size, 1);
    assert.notStrictEqual(host.current, a);
  } finally {
    host.dispose();
  }
});

test('opening a past session focuses it when open, or loads it into an empty conversation', async () => {
  const { host } = setup();
  try {
    const a = host.current;
    await until(() => a.sessionId);
    a.hasMessages = true;
    const b = host.newConversation();
    assert.strictEqual(host.openSession(a.sessionId), a);
    assert.strictEqual(host.current, a);
    host.show(b);
    await until(() => b.started);
    b.loadSession = (id) => { b.loaded = id; };
    assert.strictEqual(host.openSession('11111111-1111-1111-1111-111111111111'), b);
    assert.strictEqual(b.loaded, '11111111-1111-1111-1111-111111111111');
    assert.strictEqual(host.conversations.size, 2);
  } finally {
    host.dispose();
  }
});
