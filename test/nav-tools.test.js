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
    readFile: async () => SRC,
    toUri: (p) => ({ fsPath: p }),
    openDocument: async () => {},
    ...over,
  });
}

test('TOOLS: exactly three short-described tools', () => {
  assert.deepStrictEqual(TOOLS.map((t) => t.name), ['documentSymbols', 'readSymbol', 'findReferences']);
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
  for (const [n, a] of [['documentSymbols', {}], ['readSymbol', { symbol: 'foo' }], ['findReferences', { symbol: 'foo' }]]) {
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
