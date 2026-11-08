const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { TOOLS, createNavTools, capLines, isInsideWorkspace, resolveSymbolPosition, textPositions } = require('../src/mcp/nav-tools');

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
    readyWaitMs: 0,
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

test('no provider: a non-JS file says use Grep; a JS file that never answers says not ready', async () => {
  const t = make({ executeDocumentSymbolProvider: async () => undefined });
  const cs = path.join(ROOT, 'P.cs');
  for (const [n, a] of [['documentSymbols', {}], ['readSymbol', { symbol: 'foo' }], ['findReferences', { symbol: 'foo' }]]) {
    assert.match((await t.call(n, { file: cs, ...a })).text, /use Grep/);
    assert.match((await t.call(n, { file: FILE, ...a })).text, /not answer|yet/);
  }
});

test('readSymbol: returns only the symbol lines; unknown name explained', async () => {
  const t = make();
  assert.strictEqual((await t.call('readSymbol', { file: FILE, symbol: 'foo' })).text, 'function foo() {\n  return 1;\n}');
  assert.match((await t.call('readSymbol', { file: FILE, symbol: 'zzz' })).text, /not declared in this file; goToDefinition/);
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

test('findReferences: caps at 50, empty result explained, unknown name not found', async () => {
  const refs = Array.from({ length: 60 }, (_, i) => ({ uri: { fsPath: FILE }, range: rng(i, i) }));
  const t = make({ readFile: async () => 'l\n'.repeat(80), executeReferenceProvider: async () => refs });
  const capped = (await t.call('findReferences', { file: FILE, symbol: 'foo' })).text.split('\n');
  assert.strictEqual(capped.length, 51);
  assert.strictEqual(capped[50], '10 more not shown');
  const empty = make();
  assert.match((await empty.call('findReferences', { file: FILE, symbol: 'foo' })).text, /no references/);
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
  assert.deepStrictEqual(out, ['variable cfg lines 1-6', 'property cfg lines 3-3', 'function helper lines 10-10']);
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
  assert.match((await none.call('goToDefinition', { file: FILE, symbol: 'foo' })).text, /^defined outside the open workspace/);
  assert.strictEqual((await make().call('goToDefinition', { file: FILE, symbol: 'foo' })).text, 'no definition found');
  const nodep = make({ executeDefinitionProvider: undefined });
  assert.strictEqual((await nodep.call('goToDefinition', { file: FILE, symbol: 'foo' })).text, 'not available here');
  assert.match((await make().call('goToDefinition', { file: FILE, symbol: 'zzz' })).text, /not found/);
});

// findImporters: a relative specifier counts only when it resolves to this file (Node resolution).
const IMP = path.join(ROOT, 'src', 'math.js');
const SRCDIR = path.join(ROOT, 'src');
const hit = (rel, line, text) => ({ path: path.join(ROOT, rel), line, text });

test('findImporters: resolves relative specifiers; skips decoys, comments, strings, itself and outside', async () => {
  let seen;
  const t = make({
    searchWorkspaceText: async (pattern, folders) => {
      seen = { pattern, folders };
      return [
        hit('src/App.jsx', 2, "import Calculator, { multiply } from './math';"),
        hit('src/report.js', 4, "} from './math';"),
        hit('src/legacy.js', 1, "const math = require('./math');"),
        hit('src/lazy.js', 1, "export const loadMath = () => import('./math.js');"),
        hit('src/setup.js', 1, "import './math';"),
        hit('src/api.js', 1, "export * from './math';"),
        hit('src/utils/format.js', 1, "import { add } from '../math';"),
        hit('src/utils/format.js', 9, "import { add2 } from '../math';"),
        hit('src/other/use.js', 1, "import { add } from './math';"),
        hit('src/c.js', 1, "// import { add } from './math';"),
        hit('src/d.js', 1, "const s = \"from './math'\";"),
        hit('src/math.js', 1, "import x from './math';"),
        { path: OUTSIDE, line: 1, text: "import x from './math';" },
      ];
    },
  });
  const r = await t.call('findImporters', { file: IMP });
  assert.deepStrictEqual(r.text.split('\n'), [
    "src/App.jsx:2 import Calculator, { multiply } from './math';",
    "src/api.js:1 export * from './math';",
    "src/lazy.js:1 export const loadMath = () => import('./math.js');",
    "src/legacy.js:1 const math = require('./math');",
    "src/report.js:4 } from './math';",
    "src/setup.js:1 import './math';",
    "src/utils/format.js:1 import { add } from '../math';",
  ]);
  assert.deepStrictEqual(seen.folders, [ROOT]);
  const re = new RegExp(seen.pattern);
  assert.ok(re.test("import x from './math.js'") && re.test("const q = require('../lib/math')") && !re.test("require('./mathx')"));
});

test('findImporters: a folder index is found through the folder name; .js specifier finds a .ts file', async () => {
  const idx = path.join(SRCDIR, 'utils', 'index.js');
  const t = make({ searchWorkspaceText: async () => [hit('src/consumer.js', 1, "import { formatSum } from './utils';"), hit('src/x.js', 1, "import { y } from './other/utils';")] });
  assert.strictEqual((await t.call('findImporters', { file: idx })).text, "src/consumer.js:1 import { formatSum } from './utils';");
  const ts = path.join(SRCDIR, 'm.ts');
  const t2 = make({ searchWorkspaceText: async () => [hit('src/a.ts', 1, "import { m } from './m.js';")] });
  assert.strictEqual((await t2.call('findImporters', { file: ts })).text, "src/a.ts:1 import { m } from './m.js';");
});

test('findImporters: a bare or aliased specifier is checked with the definition provider, else [unverified]', async () => {
  const hits = [hit('src/a.js', 3, "import { add } from '@lib/math';"), hit('src/b.js', 1, "import { add } from 'some-pkg/math';")];
  const asked = {};
  const t = make({
    searchWorkspaceText: async () => hits,
    executeDefinitionProvider: async (uri, pos) => {
      asked[path.basename(uri.fsPath)] = pos;
      return uri.fsPath.endsWith('a.js') ? [loc(IMP, 0)] : [loc(OUTSIDE, 0)];
    },
  });
  assert.strictEqual((await t.call('findImporters', { file: IMP })).text, "src/a.js:3 import { add } from '@lib/math';");
  // Asked inside the module string, on the hit's line (0-based).
  assert.deepStrictEqual(asked['a.js'], { line: 2, character: "import { add } from '".length + 1 });
  assert.strictEqual(asked['b.js'].line, 0);
  const nodef = make({ searchWorkspaceText: async () => hits.slice(0, 1), executeDefinitionProvider: undefined });
  assert.strictEqual((await nodef.call('findImporters', { file: IMP })).text, "src/a.js:3 import { add } from '@lib/math'; [unverified]");
});

test('findImporters: none, cap, capped search note, missing dep, no access', async () => {
  assert.strictEqual((await make().call('findImporters', { file: IMP })).text, 'no importers found');
  const many = Array.from({ length: 60 }, (_, i) => hit(`src/f${String(i).padStart(2, '0')}.js`, 1, "require('./math')"));
  const lines = (await make({ searchWorkspaceText: async () => many }).call('findImporters', { file: IMP })).text.split('\n');
  assert.strictEqual(lines.length, 51);
  assert.strictEqual(lines[50], '10 more not shown');
  const capped = Object.assign([hit('src/a.js', 1, "require('./math')")], { capped: true });
  assert.match((await make({ searchWorkspaceText: async () => capped }).call('findImporters', { file: IMP })).text, /stopped at its limit/);
  assert.strictEqual((await make({ searchWorkspaceText: undefined }).call('findImporters', { file: IMP })).text, 'not available here');
  assert.match((await make().call('findImporters', { file: OUTSIDE })).text, /^no access/);
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

// ---- reliability fixes (2026-11-06, checked in real VS Code with dev/nav-check) ----

const APP = path.join(ROOT, 'App.jsx');
const APP_SRC = [
  "import { bar } from './b';", // 0
  '// bar in a comment', // 1
  "const s = 'bar';", // 2
  'export function App() {', // 3
  '  return bar(`${bar}`);', // 4
  '}', // 5
].join('\n');
const APP_SYMS = [sym('App', 11, 3, 5)];

test('textPositions: whole words in code; skips comments and plain strings, keeps template code', () => {
  assert.deepStrictEqual(textPositions(APP_SRC.split('\n'), 'bar'), [
    { line: 0, character: 9 }, { line: 4, character: 9 }, { line: 4, character: 16 },
  ]);
  assert.deepStrictEqual(textPositions(['barx bar_ $bar bar$ xbar'], 'bar'), []);
});

test('first JS call waits for the language server; later empty files do not wait', async () => {
  let n = 0;
  let slept = 0;
  let clock = 0;
  const t = make({
    readyWaitMs: 5000,
    sleep: async (ms) => { slept += ms; clock += ms; },
    now: () => clock,
    executeDocumentSymbolProvider: async (uri) => (uri.fsPath === FILE && ++n >= 3 ? SYMS : []),
  });
  assert.strictEqual((await t.call('documentSymbols', { file: FILE })).text.split('\n')[0], 'function foo lines 1-3');
  assert.ok(slept > 0);
  slept = 0;
  const other = path.join(ROOT, 'empty.js');
  assert.strictEqual((await t.call('documentSymbols', { file: other })).text, 'no symbols in this file');
  assert.strictEqual(slept, 0);
});

test('never ready within the wait: says so instead of "use Grep"', async () => {
  let clock = 0;
  const t = make({ readyWaitMs: 1000, sleep: async (ms) => { clock += ms; }, now: () => clock, executeDocumentSymbolProvider: async () => [] });
  const r = await t.call('documentSymbols', { file: FILE });
  assert.match(r.text, /language server/);
  assert.doesNotMatch(r.text, /Grep/);
});

test('goToDefinition/hover/findReferences work on a name that is only imported or used in the file', async () => {
  const asked = [];
  const t = make({
    readFile: async (p) => (p === APP ? APP_SRC : 'export function bar() {}'),
    executeDocumentSymbolProvider: async () => APP_SYMS,
    executeDefinitionProvider: async (uri, pos) => { asked.push(pos); return [loc(OTHER, 0)]; },
    executeHoverProvider: async (uri, pos) => [{ contents: [{ value: '```typescript\n(loading...) function bar(): void\n```' }] }],
    executeReferenceProvider: async (uri, pos) => [loc(OTHER, 0), loc(APP, 0), loc(APP, 4)],
  });
  assert.strictEqual((await t.call('goToDefinition', { file: APP, symbol: 'bar' })).text, 'b.js:1 export function bar() {}');
  assert.deepStrictEqual(asked[0], { line: 0, character: 9 });
  assert.strictEqual((await t.call('hover', { file: APP, symbol: 'bar' })).text, 'function bar(): void');
  assert.deepStrictEqual((await t.call('findReferences', { file: APP, symbol: 'bar' })).text.split('\n'),
    ["App.jsx:1: import { bar } from './b';", 'App.jsx:5: return bar(`${bar}`);', 'b.js:1: export function bar() {}']);
  const lineHint = [];
  const t2 = make({ readFile: async () => APP_SRC, executeDocumentSymbolProvider: async () => APP_SYMS,
    executeDefinitionProvider: async (u, pos) => { lineHint.push(pos); return [loc(OTHER, 0)]; } });
  await t2.call('goToDefinition', { file: APP, symbol: 'bar', line: 5 });
  assert.deepStrictEqual(lineHint[0], { line: 4, character: 9 });
});

test('goToDefinition: an answer that stops at an import in the same file is skipped for a use site', async () => {
  const t = make({
    readFile: async (p) => (p === APP ? APP_SRC : 'export function bar() {}'),
    executeDocumentSymbolProvider: async () => APP_SYMS,
    executeDefinitionProvider: async (uri, pos) => (pos.line === 0 ? [loc(APP, 0)] : [loc(OTHER, 0)]),
  });
  assert.strictEqual((await t.call('goToDefinition', { file: APP, symbol: 'bar' })).text, 'b.js:1 export function bar() {}');
});

test('goToDefinition: when only the import is known, the module is resolved, opened and searched', async () => {
  const B = path.join(ROOT, 'b.js');
  const opened = [];
  const t = make({
    readFile: async (p) => { if (p === APP) return APP_SRC; if (p === B) return 'x\nexport const bar = () => 1;'; throw new Error('ENOENT'); },
    openDocument: async (u) => { opened.push(u.fsPath); },
    executeDocumentSymbolProvider: async (uri) => (uri.fsPath === B ? [sym('bar', 13, 1, 1)] : APP_SYMS),
    executeDefinitionProvider: async () => [loc(APP, 0)],
  });
  assert.strictEqual((await t.call('goToDefinition', { file: APP, symbol: 'bar' })).text, 'b.js:2 export const bar = () => 1;');
  assert.ok(opened.includes(B));
});

test('findReferences: opens files that mention the name, and adds uses the provider missed when VS Code resolves them to the same declaration', async () => {
  const L = path.join(ROOT, 'legacy.js');
  const D = path.join(ROOT, 'decoy.js');
  const files = { [FILE]: SRC, [L]: "const m = require('./a');\nm.foo(1);", [D]: 'foo();' };
  const opened = [];
  const t = make({
    readFile: async (p) => files[p],
    openDocument: async (u) => { opened.push(u.fsPath); },
    searchWorkspaceText: async () => [{ path: FILE, line: 1, text: 'function foo() {' }, { path: L, line: 2, text: 'm.foo(1);' }, { path: D, line: 1, text: 'foo();' }],
    executeReferenceProvider: async () => [loc(FILE, 0), loc(FILE, 3)],
    executeDefinitionProvider: async (uri) => (uri.fsPath === D ? [loc(D, 9)] : [loc(FILE, 0)]),
  });
  const r = await t.call('findReferences', { file: FILE, symbol: 'foo' });
  assert.deepStrictEqual(r.text.split('\n'), ['a.js:1: function foo() {', 'a.js:4: const x = foo();', 'legacy.js:2: m.foo(1);']);
  assert.ok(opened.includes(L) && opened.includes(D));
});

test('callHierarchy incoming: a missed call is added with its enclosing named function', async () => {
  const L = path.join(ROOT, 'legacy.js');
  const LSRC = "const m = require('./a');\nfunction total(xs) {\n  return xs.reduce((s, x) => m.foo(s, x), 0);\n}";
  const t = make({
    readFile: async (p) => (p === L ? LSRC : SRC),
    searchWorkspaceText: async () => [{ path: L, line: 3, text: '  return xs.reduce((s, x) => m.foo(s, x), 0);' }],
    executeDocumentSymbolProvider: async (uri) => (uri.fsPath === L
      ? [sym('total', 11, 1, 3, [sym('xs.reduce() callback', 11, 2, 2)])] : SYMS),
    executeReferenceProvider: async () => [loc(FILE, 0)],
    executeDefinitionProvider: async () => [loc(FILE, 0)],
    prepareCallHierarchy: async () => [item('foo', FILE, 0)],
    incomingCalls: async () => [{ from: item('caller', OTHER, 4) }],
    outgoingCalls: async () => [],
  });
  assert.strictEqual((await t.call('callHierarchy', { file: FILE, symbol: 'foo', direction: 'incoming' })).text,
    'caller b.js:5\ntotal legacy.js:2\n' + NOTE);
});

test('callHierarchy: the note fits inside the 2,000-character cap', async () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ from: item('c'.repeat(60) + i, OTHER, i) }));
  const t = make({ prepareCallHierarchy: async () => [item('foo', FILE, 0)], incomingCalls: async () => many, outgoingCalls: async () => [] });
  const text = (await t.call('callHierarchy', { file: FILE, symbol: 'foo', direction: 'incoming' })).text;
  assert.ok(text.length <= 2000, String(text.length));
  assert.ok(text.endsWith(NOTE));
});

test('documentSymbols: arrow-function variables are functions; locals inside functions are left out; line order', async () => {
  const src = ['const handlers = {', '  double: (n) => n * 2,', '};', 'export const Button = ({ label }) => (', '  label', ');', 'export function App() {', '  const [n, setN] = useState(1);', '}'];
  const syms = [
    sym('App', 11, 6, 8, [sym('n', 12, 7, 7), sym('setN', 12, 7, 7)]),
    sym('handlers', 12, 0, 2, [sym('double', 5, 1, 1)]),
    sym('Button', 12, 3, 5),
  ];
  // selectionRange starts at character 9 in sym(); point it at the name instead.
  syms[1].selectionRange.start.character = 6;
  syms[2].selectionRange.start.character = 13;
  const t = make({ readFile: async () => src.join('\n'), executeDocumentSymbolProvider: async () => syms });
  assert.deepStrictEqual((await t.call('documentSymbols', { file: APP })).text.split('\n'),
    ['variable handlers lines 1-3', 'method double lines 2-2', 'function Button lines 4-6', 'function App lines 7-9']);
  assert.deepStrictEqual((await t.call('documentSymbols', { file: APP, kind: 'function' })).text.split('\n'),
    ['method double lines 2-2', 'function Button lines 4-6', 'function App lines 7-9']);
  assert.strictEqual((await t.call('documentSymbols', { file: APP, kind: 'variable' })).text, 'variable handlers lines 1-3');
});
