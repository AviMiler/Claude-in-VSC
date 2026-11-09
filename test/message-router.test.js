// routeMessage: a rejecting async handler is logged, never left as an unhandled rejection.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const vscodeStub = { workspace: { workspaceFolders: [{ uri: { fsPath: process.cwd() } }] } };
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? 'vscode-stub' : resolve.call(this, request, ...rest);
};
require.cache['vscode-stub'] = { id: 'vscode-stub', filename: 'vscode-stub', loaded: true, exports: vscodeStub };
const { routeMessage } = require('../src/panels/message-router');

function fakeConversation(overrides) {
  const warns = [];
  return { warns, services: { logger: { info() {}, debug() {}, warn: (tag, t) => warns.push(`[${tag}] ${t}`) } }, ...overrides };
}

test('a rejecting async handler is logged and does not become an unhandled rejection', async () => {
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  const c = fakeConversation({ openChangeDiff: () => Promise.reject(new Error('boom')) });
  routeMessage(c, { type: 'openChangeDiff', path: 'a.js' });
  await new Promise((r) => setTimeout(r, 20));
  process.off('unhandledRejection', onUnhandled);
  assert.deepStrictEqual(unhandled, []);
  assert.strictEqual(c.warns.length, 1);
  assert.match(c.warns[0], /openChangeDiff failed: boom/);
});

test('a synchronously throwing handler is logged too', () => {
  const c = fakeConversation({ interrupt: () => { throw new Error('sync'); } });
  routeMessage(c, { type: 'interrupt' });
  assert.match(c.warns[0], /interrupt failed: sync/);
});
