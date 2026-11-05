const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { TOOLS, createNavTools, capLines, isInsideWorkspace, resolveSymbolPosition } = require('../src/mcp/nav-tools');

const ROOT = path.resolve('/ws');
const FILE = path.join(ROOT, 'a.js');
const OTHER = path.join(ROOT, 'b.js');
const rng = (a, b, sl, sc) => ({ start: { line: a, character: 0 }, end: { line: b, character: 0 }, });
const sym = (name, kind, a, b, children) => ({
  name, kind, range: rng(a, b), selectionRange: { start: { line: a, character: 9 }, end: { line: a, character: 12 } }, children: children || [],
});
const SRC = ['function foo() {', '  return 1;', '}', 'const x = foo();', 'class K {', '  m() {}', '}'].join('\n');
const SYMS = [sym('foo', 11, 0, 2), sym('x', 12, 3, 3), sym('K', 4, 4, 6, [sym('m', 5, 5, 5)])];

function make(over) {
  return createNavTools({
    workspaceFolders: [ROOT],
    executeDocumentSymbolProvider: async () => SYMS,
    executeReferenceProvider: async () => [],
    executeDefinitionProvider: async () => [],
    searchWorkspaceText: async () => [],
    readFile: async () => SRC,
    toUri: (p) => ({ fsPath: p }),
    openDocument: async () => {},
    ...over,
  });
}

test('TOOLS: eight short-described tools', () => {
  assert.deepStrictEqual(TOOLS.map((t) => t.name), ['documentSymbols', 'readSymbol', 'findReferences', 'goToDefinition', 'findImporters', 'workspaceSymbols', 'hover', 'callHierarchy']);
  for (const t of TOOLS) assert.ok(t.description.length < 100);
});

test('capLines: under limits returns plain text', () => {
  assert.strictEqual(capLines(['a', 'b']), 'a\nb');
});

test('capLines: cuts at max count with suffix', () => {
  const items = Array.from({ length: 60 }, (_, i) => 'l' + i);
  const out = capLines(items).split('\n');
  assert.strictEqual(out.length, 51);
  assert.strictEqual(out[50], '10 more not shown');
});

test('capLines: cuts at max chars with suffix', () => {
  const out = capLines(['x'.repeat(1500), 'y'.repeat(1500), 'z'], 50, 2000);
  assert.strictEqual(out, 'x'.repeat(1500) + '\n2 more not shown');
});

test('capLines: a single oversized item is truncated, not dropped', () => {
  assert.strictEqual(capLines(['x'.repeat(3000)], 50, 2000), 'x'.repeat(2000));
});

test('isInsideWorkspace: inside, outside, sibling prefix, case on Windows', () => {
  assert.ok(isInsideWorkspace(FILE, [ROOT]));
  assert.ok(isInsideWorkspace(ROOT, [ROOT]));
  assert.ok(!isInsideWorkspace(path.resolve('/other/a.js'), [ROOT]));
  assert.ok(!isInsideWorkspace(ROOT + 'x/a.js', [ROOT]));
  assert.ok(!isInsideWorkspace(path.join(ROOT, '..', 'a.js'), [ROOT]));
  assert.ok(isInsideWorkspace('C:\\Ws\\Sub\\f.js', ['c:/ws'], 'win32'));
  assert.ok(!isInsideWorkspace('C:\\Ws\\Sub\\f.js', ['c:/ws'], 'linux'));
});

test('resolveSymbolPosition: finds nested, disambiguates by line, null when missing', () => {
  assert.deepStrictEqual(resolveSymbolPosition(SYMS, 'm'), { line: 5, character: 9 });
  const dup = [sym('d', 11, 0, 1), sym('d', 11, 5, 8)];
  assert.strictEqual(resolveSymbolPosition(dup, 'd', 7).line, 5);
  assert.strictEqual(resolveSymbolPosition(dup, 'd').line, 0);
  assert.strictEqual(resolveSymbolPosition(SYMS, 'nope'), null);
});

test('documentSymbols: flat lines, 1-based ranges, kind filter', async () => {
  const t = make();
  const all = await t.call('documentSymbols', { file: FILE });
  assert.deepStrictEqual(all.text.split('\n'), ['function foo lines 1-3', 'variable x lines 4-4', 'class K lines 5-7', 'method m lines 6-6']);
  const fn = await t.call('documentSymbols', { file: FILE, kind: 'function' });
  assert.deepStrictEqual(fn.text.split('\n'), ['function foo lines 1-3', 'method m lines 6-6']);
  assert.ok((await t.call('documentSymbols', { file: FILE, kind: 'bogus' })).error);
});

test('documentSymbols: relative path resolves against the first folder; capped', async () => {
  const many = Array.from({ length: 70 }, (_, i) => sym('s' + i, 11, i, i));
  const t = make({ executeDocumentSymbolProvider: async () => many });
  const r = await t.call('documentSymbols', { file: 'a.js' });
  assert.ok(r.text.endsWith('20 more not shown'));
});

test('path limit: every tool answers no access outside the workspace', async () => {
  const t = make();
  const out = path.resolve('/elsewhere/a.js');
  for (const [n, a] of [['documentSymbols', {}], ['readSymbol', { symbol: 'foo' }], ['findReferences', { symbol: 'foo' }], ['goToDefinition', { symbol: 'foo' }], ['findImporters', {}]]) {
    const r = await t.call(n, { file: out, ...a });
    assert.match(r.text, /^no access/);
  }
});

test('no provider: plain text, no throw', async () => {
  const t = make({ executeDocumentSymbolProvider: async () => undefined });
  for (const [n, a] of [['documentSymbols', {}], ['readSymbol', { symbol: 'foo' }], ['findReferences', { symbol: 'foo' }]]) {
    const r = await t.call(n, { file: FILE, ...a });
    assert.match(r.text, /use Grep/);
  }
});

test('readSymbol: returns only the symbol lines; unknown name explained', async () => {
  const t = make();
  assert.strictEqual((await t.call('readSymbol', { file: FILE, symbol: 'foo' })).text, 'function foo() {\n  return 1;\n}');
  assert.match((await t.call('readSymbol', { file: FILE, symbol: 'zzz' })).text, /not found/);
});

test('readSymbol: capped at 2000 characters', async () => {
  const big = Array.from({ length: 100 }, () => 'x'.repeat(50)).join('\n');
  const t = make({ readFile: async () => big, executeDocumentSymbolProvider: async () => [sym('foo', 11, 0, 99)] });
  const r = await t.call('readSymbol', { file: FILE, symbol: 'foo' });
  assert.ok(r.text.length < 2100);
  assert.match(r.text, /\d+ more not shown$/);
});

test('findReferences: groups by file, one source line each, skips outside workspace', async () => {
  const files = { [FILE]: SRC, [OTHER]: 'a\nb\n  foo();' };
  const loc = (p, l) => ({ uri: { fsPath: p }, range: rng(l, l) });
  const t = make({
    readFile: async (p) => files[p],
    executeReferenceProvider: async (uri, pos) => {
      assert.deepStrictEqual(pos, { line: 0, character: 9 });
      return [loc(FILE, 3), loc(OTHER, 2), loc(path.resolve('/elsewhere/z.js'), 1), loc(FILE, 3)];
    },
  });
  const r = await t.call('findReferences', { file: FILE, symbol: 'foo' });
  assert.deepStrictEqual(r.text.split('\n'), ['a.js:4: const x = foo();', 'b.js:3: foo();']);
});

test('findReferences: caps at 50, falls back to findSymbolPosition, empty result explained', async () => {
  const refs = Array.from({ length: 60 }, (_, i) => ({ uri: { fsPath: FILE }, range: rng(i, i) }));
  const t = make({ readFile: async () => 'l\n'.repeat(80), executeReferenceProvider: async () => refs });
  const capped = (await t.call('findReferences', { file: FILE, symbol: 'foo' })).text.split('\n');
  assert.strictEqual(capped.length, 51);
  assert.strictEqual(capped[50], '10 more not shown');
  const empty = make();
  assert.match((await empty.call('findReferences', { file: FILE, symbol: 'foo' })).text, /no references/);
  const fb = make({ findSymbolPosition: async () => ({ line: 1, character: 1 }), executeReferenceProvider: async () => [] });
  assert.match((await fb.call('findReferences', { file: FILE, symbol: 'unlisted' })).text, /no references/);
  const missing = await make().call('findReferences', { file: FILE, symbol: 'unlisted' });
  assert.match(missing.text, /not found/);
});

test('errors from deps become { error }, unknown tool too', async () => {
  const t = make({ executeDocumentSymbolProvider: async () => { throw new Error('boom'); } });
  assert.deepStrictEqual(await t.call('documentSymbols', { file: FILE }), { error: 'boom' });
  assert.ok((await t.call('nope', {})).error);
});

const OUTSIDE = path.resolve('/elsewhere/z.js');
const loc = (p, l) => ({ uri: { fsPath: p }, range: rng(l, l) });

test('documentSymbols: keeps a real object property, drops export shorthand and <unknown>', async () => {
  const same = { start: { line: 9, character: 2 }, end: { line: 9, character: 8 } };
  const mk = (name, kind, range) => ({ name, kind, range, selectionRange: range, children: [] });
  const syms = [
    mk('helper', 11, same), mk('helper', 6, same),
    mk('cfg', 12, rng(0, 5)), mk('cfg', 6, rng(2, 2)),
    mk('<unknown>', 12, rng(6, 6)), mk('', 12, rng(7, 7)),
  ];
  const t = make({ executeDocumentSymbolProvider: async () => syms });
  const out = (await t.call('documentSymbols', { file: FILE })).text.split('\n');
  assert.deepStrictEqual(out, ['function helper lines 10-10', 'variable cfg lines 1-6', 'property cfg lines 3-3']);
});

test('goToDefinition: Location and LocationLink, workspace only, deduped, one line each', async () => {
  const files = { [FILE]: SRC, [OTHER]: 'x\ny\n  export function foo() {}' };
  const t = make({
    readFile: async (p) => files[p],
    executeDefinitionProvider: async (uri, pos) => {
      assert.deepStrictEqual(pos, { line: 0, character: 9 });
      return [loc(OTHER, 2), { targetUri: { fsPath: FILE }, targetRange: rng(4, 6) }, loc(OUTSIDE, 0), loc(OTHER, 2)];
    },
  });
  const r = await t.call('goToDefinition', { file: FILE, symbol: 'foo' });
  assert.deepStrictEqual(r.text.split('\n'), ['b.js:3 export function foo() {}', 'a.js:5 class K {']);
});

test('goToDefinition: caps at 50, plain text for none, missing dep, unknown symbol', async () => {
  const many = Array.from({ length: 60 }, (_, i) => loc(FILE, i));
  const t = make({ readFile: async () => 'l\n'.repeat(80), executeDefinitionProvider: async () => many });
  const lines = (await t.call('goToDefinition', { file: FILE, symbol: 'foo' })).text.split('\n');
  assert.strictEqual(lines.length, 51);
  assert.strictEqual(lines[50], '10 more not shown');
  const none = make({ executeDefinitionProvider: async () => [loc(OUTSIDE, 1)] });
  assert.strictEqual((await none.call('goToDefinition', { file: FILE, symbol: 'foo' })).text, 'no definition found');
  const nodep = make({ executeDefinitionProvider: undefined });
  assert.strictEqual((await nodep.call('goToDefinition', { file: FILE, symbol: 'foo' })).text, 'not available here');
  assert.match((await make().call('goToDefinition', { file: FILE, symbol: 'zzz' })).text, /not found/);
});

test('findImporters: primary uses export references, skips the module itself, tagged [ref]', async () => {
  const files = { [FILE]: SRC, [OTHER]: "const a = 1;\nconst { foo } = require('./a');\nfoo();" };
  const t = make({
    readFile: async (p) => files[p],
    executeDocumentSymbolProvider: async () => [sym('foo', 11, 0, 2), sym('x', 12, 3, 3)],
    executeReferenceProvider: async () => [loc(FILE, 3), loc(OTHER, 2), loc(OTHER, 1), loc(OUTSIDE, 1)],
    searchWorkspaceText: async () => { throw new Error('should not run'); },
  });
  const r = await t.call('findImporters', { file: FILE });
  assert.strictEqual(r.text, "b.js:2 const { foo } = require('./a'); [ref]");
});

test('findImporters: falls back to text search, tagged [text], pattern uses the base name', async () => {
  let seen;
  const t = make({
    executeDocumentSymbolProvider: async () => [],
    searchWorkspaceText: async (pattern, folders) => {
      seen = { pattern, folders };
      return [
        { path: OTHER, line: 4, text: "  import x from './a.js';  " },
        { path: OTHER, line: 9, text: "import y from './a'" },
        { path: FILE, line: 1, text: "require('./a')" },
        { path: OUTSIDE, line: 1, text: "require('./a')" },
      ];
    },
  });
  const r = await t.call('findImporters', { file: FILE });
  assert.strictEqual(r.text, "b.js:4 import x from './a.js'; [text]");
  assert.deepStrictEqual(seen.folders, [ROOT]);
  const re = new RegExp(seen.pattern);
  assert.ok(re.test("import x from './a.js'") && re.test("const q = require('../lib/a')") && !re.test("require('./ab')"));
});

test('findImporters: only-self references use fallback; none, cap and missing dep are plain text', async () => {
  const onlySelf = make({ executeReferenceProvider: async () => [loc(FILE, 3)], searchWorkspaceText: async () => [] });
  assert.strictEqual((await onlySelf.call('findImporters', { file: FILE })).text, 'no importers found');
  const hits = Array.from({ length: 60 }, (_, i) => ({ path: path.join(ROOT, 'f' + i + '.js'), line: 1, text: "require('./a')" }));
  const capped = make({ executeDocumentSymbolProvider: async () => [], searchWorkspaceText: async () => hits });
  const lines = (await capped.call('findImporters', { file: FILE })).text.split('\n');
  assert.strictEqual(lines.length, 51);
  assert.strictEqual(lines[50], '10 more not shown');
  const nodep = make({ searchWorkspaceText: undefined });
  assert.strictEqual((await nodep.call('findImporters', { file: FILE })).text, 'not available here');
});

const wsym = (name, kind, p, l) => ({ name, kind, location: { uri: { fsPath: p }, range: rng(l, l) } });

test('workspaceSymbols: shaping, kind filter, outside dropped, empty, bad kind, missing dep, cap', async () => {
  const t = make({
    executeWorkspaceSymbolProvider: async (q) => {
      assert.strictEqual(q, 'foo');
      return [wsym('foo', 11, FILE, 0), wsym('Foo', 4, OTHER, 9), wsym('foo2', 11, OUTSIDE, 1), wsym('fooV', 12, OTHER, 3)];
    },
  });
  assert.deepStrictEqual((await t.call('workspaceSymbols', { query: 'foo' })).text.split('\n'), ['function foo a.js:1', 'class Foo b.js:10', 'variable fooV b.js:4']);
  assert.strictEqual((await t.call('workspaceSymbols', { query: 'foo', kind: 'class' })).text, 'class Foo b.js:10');
  assert.ok((await t.call('workspaceSymbols', { query: 'foo', kind: 'bogus' })).error);
  const none = make({ executeWorkspaceSymbolProvider: async () => [wsym('z', 11, OUTSIDE, 0)] });
  assert.strictEqual((await none.call('workspaceSymbols', { query: 'z' })).text, 'no symbols match');
  let called = false;
  const e = make({ executeWorkspaceSymbolProvider: async () => { called = true; return []; } });
  const er = await e.call('workspaceSymbols', { query: '  ' });
  assert.ok(!er.error && er.text && !called);
  assert.strictEqual((await make().call('workspaceSymbols', { query: 'x' })).text, 'not available here');
  const many = Array.from({ length: 60 }, (_, i) => wsym('s' + i, 11, FILE, i));
  const lines = (await make({ executeWorkspaceSymbolProvider: async () => many }).call('workspaceSymbols', { query: 's' })).text.split('\n');
  assert.strictEqual(lines.length, 51);
  assert.strictEqual(lines[50], '10 more not shown');
});

test('hover: flattens string, MarkdownString and {value}; empty, cap, missing dep, access', async () => {
  const t = make({
    executeHoverProvider: async (uri, pos) => {
      assert.deepStrictEqual(pos, { line: 0, character: 9 });
      return [{ contents: [{ value: ' function foo(): number ' }, 'docs here'] }, { contents: { value: '' } }, { contents: 'more' }];
    },
  });
  assert.strictEqual((await t.call('hover', { file: FILE, symbol: 'foo' })).text, 'function foo(): number\n\ndocs here\n\nmore');
  const empty = make({ executeHoverProvider: async () => [] });
  assert.strictEqual((await empty.call('hover', { file: FILE, symbol: 'foo' })).text, 'no hover info');
  const big = make({ executeHoverProvider: async () => [{ contents: ['x'.repeat(3000)] }] });
  assert.strictEqual((await big.call('hover', { file: FILE, symbol: 'foo' })).text.length, 2000);
  assert.strictEqual((await make().call('hover', { file: FILE, symbol: 'foo' })).text, 'not available here');
  assert.match((await empty.call('hover', { file: OUTSIDE, symbol: 'foo' })).text, /^no access/);
});

const item = (name, p, l) => ({ name, uri: { fsPath: p }, range: rng(l, l), selectionRange: rng(l, l) });
const NOTE = 'call hierarchy is less reliable in dynamic JavaScript';

test('callHierarchy: incoming and outgoing shaping, outside dropped, note appended', async () => {
  const t = make({
    prepareCallHierarchy: async (uri, pos) => { assert.deepStrictEqual(pos, { line: 0, character: 9 }); return [item('foo', FILE, 0)]; },
    incomingCalls: async (it) => { assert.strictEqual(it.name, 'foo'); return [{ from: item('caller', OTHER, 4) }, { from: item('ext', OUTSIDE, 1) }]; },
    outgoingCalls: async () => [{ to: item('callee', OTHER, 1) }, { to: item('ext', OUTSIDE, 1) }],
  });
  assert.strictEqual((await t.call('callHierarchy', { file: FILE, symbol: 'foo', direction: 'incoming' })).text, 'caller b.js:5\n' + NOTE);
  assert.strictEqual((await t.call('callHierarchy', { file: FILE, symbol: 'foo', direction: 'outgoing' })).text, 'callee b.js:2\n' + NOTE);
});

test('callHierarchy: direction validation, unsupported, empty, cap, missing dep', async () => {
  const base = { prepareCallHierarchy: async () => [item('foo', FILE, 0)], incomingCalls: async () => [], outgoingCalls: async () => [] };
  const t = make(base);
  assert.ok((await t.call('callHierarchy', { file: FILE, symbol: 'foo', direction: 'sideways' })).error);
  assert.ok((await t.call('callHierarchy', { file: FILE, symbol: 'foo' })).error);
  assert.strictEqual((await t.call('callHierarchy', { file: FILE, symbol: 'foo', direction: 'incoming' })).text, 'no incoming calls found');
  const unsupported = make({ ...base, prepareCallHierarchy: async () => [] });
  assert.strictEqual((await unsupported.call('callHierarchy', { file: FILE, symbol: 'foo', direction: 'incoming' })).text, 'no call hierarchy here (not supported for this language)');
  const many = Array.from({ length: 60 }, (_, i) => ({ from: item('c' + i, OTHER, i) }));
  const lines = (await make({ ...base, incomingCalls: async () => many }).call('callHierarchy', { file: FILE, symbol: 'foo', direction: 'incoming' })).text.split('\n');
  assert.strictEqual(lines.length, 52);
  assert.strictEqual(lines[50], '10 more not shown');
  assert.strictEqual(lines[51], NOTE);
  assert.strictEqual((await make().call('callHierarchy', { file: FILE, symbol: 'foo', direction: 'incoming' })).text, 'not available here');
  const noIn = make({ ...base, incomingCalls: undefined });
  assert.strictEqual((await noIn.call('callHierarchy', { file: FILE, symbol: 'foo', direction: 'incoming' })).text, 'not available here');
});
