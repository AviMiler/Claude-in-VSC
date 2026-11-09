// The diff failure path of Conversation: a diff that cannot open is logged and shown to the user.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

const errors = [];
const vscodeStub = {
  workspace: { workspaceFolders: [{ uri: { fsPath: process.cwd() } }] },
  window: {
    showErrorMessage: (m) => { errors.push(m); },
    showQuickPick: async (items) => items[0],
  },
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? 'vscode-stub' : resolve.call(this, request, ...rest);
};
require.cache['vscode-stub'] = { id: 'vscode-stub', filename: 'vscode-stub', loaded: true, exports: vscodeStub };
const { Conversation } = require('../src/panels/conversation');

const FILE = path.join(process.cwd(), 'src', 'foo.js');

function setup({ diffShow }) {
  errors.length = 0;
  const warns = [];
  const webview = { onDidReceiveMessage: () => ({ dispose() {} }), postMessage() {} };
  const services = {
    logger: { info() {}, warn: (...a) => warns.push(a), debug() {} },
    settings: { get: () => ({}), onDidChange: () => ({ dispose() {} }) },
    registry: { findBySession: () => null },
    diffView: { show: diffShow },
  };
  const c = new Conversation({ webview, services });
  c.edits.byId.set('t1', { path: FILE, fragments: [{ before: 'a', after: 'b' }], write: false });
  return { c, warns };
}

test('openChangeDiff: a rejecting diff view -> Hebrew error with name and message, warn logged', async () => {
  const { c, warns } = setup({ diffShow: async () => { throw new Error('boom'); } });
  await c.openChangeDiff(FILE);
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0], 'לא ניתן לפתוח את ההשוואה של foo.js: boom');
  assert.strictEqual(warns.length, 1);
  assert.strictEqual(warns[0][0], 'diff');
  assert.match(warns[0][1], /boom/);
});

test('openChangeDiff: a path not in the edit log shows nothing', async () => {
  let shown = 0;
  const { c, warns } = setup({ diffShow: async () => { shown += 1; } });
  await c.openChangeDiff(path.join(process.cwd(), 'other.js'));
  assert.strictEqual(shown, 0);
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(warns.length, 0);
});

test('diffCommand: a failing diff view -> Hebrew error naming /diff', async () => {
  const { c, warns } = setup({ diffShow: async () => { throw new Error('נכשל'); } });
  await c.diffCommand();
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /^לא ניתן לפתוח את ההשוואה של \/diff: /);
  assert.ok(errors[0].endsWith('נכשל'));
  assert.strictEqual(warns.length, 1);
});
