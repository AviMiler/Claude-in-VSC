const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// Minimal fake of the 'vscode' API surface nav-vscode.js uses.
const calls = [];
let fileList = [];
const fakeVscode = {
  workspace: {
    workspaceFolders: [],
    findFiles: async () => fileList.map((p) => ({ fsPath: p })),
  },
  Uri: { file: (p) => ({ fsPath: p }) },
  RelativePattern: function (base, pattern) { this.base = base; this.pattern = pattern; },
  Position: function (line, character) { this.line = line; this.character = character; },
  commands: { executeCommand: async (...args) => { calls.push(args); return []; } },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') return fakeVscode;
  return origLoad.call(this, request, ...rest);
};
const { createVscodeNavDeps } = require('../src/mcp/nav-vscode');
Module._load = origLoad;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'navvs-'));
const a = path.join(dir, 'a.js');
const big = path.join(dir, 'big.js');
const missing = path.join(dir, 'gone.js');
fs.writeFileSync(a, "const x = require('./b');\r\nfoo();\nimport y from './b';\n");
fs.writeFileSync(big, "require('./b');\n" + 'x'.repeat(1024 * 1024 + 10));

test('executeDefinitionProvider passes uri and Position', async () => {
  const deps = createVscodeNavDeps();
  await deps.executeDefinitionProvider('U', { line: 3, character: 7 });
  const [cmd, uri, pos] = calls.at(-1);
  assert.strictEqual(cmd, 'vscode.executeDefinitionProvider');
  assert.strictEqual(uri, 'U');
  assert.deepStrictEqual([pos.line, pos.character], [3, 7]);
});

test('symbol, hover and call-hierarchy deps call the right commands', async () => {
  const deps = createVscodeNavDeps();
  const p = { line: 2, character: 5 };
  const cases = [
    [() => deps.executeWorkspaceSymbolProvider('foo'), 'vscode.executeWorkspaceSymbolProvider', 'foo', false],
    [() => deps.executeHoverProvider('U', p), 'vscode.executeHoverProvider', 'U', true],
    [() => deps.prepareCallHierarchy('U', p), 'vscode.prepareCallHierarchy', 'U', true],
    [() => deps.incomingCalls('I'), 'vscode.provideIncomingCalls', 'I', false],
    [() => deps.outgoingCalls('I'), 'vscode.provideOutgoingCalls', 'I', false],
  ];
  for (const [run, id, arg, hasPos] of cases) {
    await run();
    const c = calls.at(-1);
    assert.strictEqual(c[0], id);
    assert.strictEqual(c[1], arg);
    if (hasPos) {
      assert.ok(c[2] instanceof fakeVscode.Position);
      assert.deepStrictEqual([c[2].line, c[2].character], [2, 5]);
    } else {
      assert.strictEqual(c.length, 2);
    }
  }
});

test('searchWorkspaceText returns 1-based matches, skips big and missing files', async () => {
  fileList = [a, big, missing];
  const res = await createVscodeNavDeps().searchWorkspaceText("\\./b'", [dir]);
  assert.deepStrictEqual(res, [
    { path: a, line: 1, text: "const x = require('./b');" },
    { path: a, line: 3, text: "import y from './b';" },
  ]);
});

test('searchWorkspaceText caps at 500 matches', async () => {
  const many = path.join(dir, 'many.js');
  fs.writeFileSync(many, 'hit\n'.repeat(600));
  fileList = [many, a];
  const res = await createVscodeNavDeps().searchWorkspaceText('hit', [dir]);
  assert.strictEqual(res.length, 500);
});
