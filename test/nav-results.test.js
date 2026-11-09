// Navigation tool rows: result-line parsing for the clickable card (webview/chat/nav-results.js),
// the tool-row summaries (webview/chat/tools.js) and the host's relative-path resolution.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const nav = require('../webview/chat/nav-results');
const { resolvePath } = require('../src/panels/resolve-path');

// tools.js is a webview script: give it the two CL helpers it reads, then load it.
globalThis.CL = { el: () => null, truncate: (s, n) => (s.length > n ? s.slice(0, n) : s) };
require('../webview/chat/tools');
const tools = globalThis.CL.tools;

test('parse: reference, definition and importer lines (path first)', () => {
  const r = nav.parse('src/a.js:12: const x = add(1, 2);\nsrc/b c.js:3: skipped (space in path)\nlib/c.ts:7 import { add } from "./a"\nlib/d.js:9 \n2 more not shown');
  assert.deepStrictEqual(r.items[0], { path: 'src/a.js', line: 12, label: 'const x = add(1, 2);', code: true });
  assert.deepStrictEqual(r.items.slice(1).map((i) => [i.path, i.line, i.label]), [['lib/c.ts', 7, 'import { add } from "./a"'], ['lib/d.js', 9, '']]);
  assert.strictEqual(r.more, 2);
});

test('parse: symbol lines (kind name path:line, name path:line) and outline lines', () => {
  const ws = nav.parse('function add src/math.js:4\nclass Shop src/shop.js:10');
  assert.deepStrictEqual(ws.items.map((i) => [i.label, i.path, i.line, i.code]), [['function add', 'src/math.js', 4, false], ['class Shop', 'src/shop.js', 10, false]]);
  const calls = nav.parse('(top level) app.js:2\ntotal src/cart.js:30\ncall hierarchy is less reliable in dynamic JavaScript');
  assert.deepStrictEqual(calls.items.map((i) => [i.label, i.path, i.line]), [['(top level)', 'app.js', 2], ['total', 'src/cart.js', 30]]);
  const outline = nav.parse('function add lines 3-9\nvariable x lines 11-11', 'src/math.js');
  assert.deepStrictEqual(outline.items[0], { path: 'src/math.js', line: 3, label: 'function add', code: false, end: 9 });
  assert.strictEqual(nav.parse('function add lines 3-9').items.length, 0, 'no input file: no location');
});

test('parse: lines without a location are ignored; Windows absolute paths work', () => {
  assert.deepStrictEqual(nav.parse('no references found\n\n(text search stopped at its limit; there may be more importers)'), { items: [], more: 0 });
  assert.deepStrictEqual(nav.parse('symbol "x" not found in this file').items, []);
  const abs = nav.parse('C:/work/a.js:5: x()').items[0];
  assert.deepStrictEqual([abs.path, abs.line], ['C:/work/a.js', 5]);
});

test('title and toolOf: Hebrew titles; readSymbol/hover and other tools get no card', () => {
  assert.deepStrictEqual(nav.title('findReferences', { symbol: 'add' }), { text: 'הפניות ל-', name: 'add' });
  assert.deepStrictEqual(nav.title('findImporters', { file: 'a.js' }), { text: 'קבצים שמייבאים את ', name: 'a.js' });
  assert.strictEqual(nav.title('callHierarchy', { symbol: 'f', direction: 'outgoing' }).text, 'קריאות מתוך ');
  assert.strictEqual(nav.toolOf('mcp__claude-local-nav__findReferences'), 'findReferences');
  assert.strictEqual(nav.toolOf('mcp__claude-local-nav__hover'), '');
  assert.strictEqual(nav.toolOf('mcp__claude-local-nav__readSymbol'), '');
  assert.strictEqual(nav.toolOf('Read'), '');
});

test('tools.summary: navigation tools give "symbol · file" with the file and line to open', () => {
  const P = 'mcp__claude-local-nav__';
  assert.deepStrictEqual(tools.summary(`${P}findReferences`, { file: 'src/a.js', symbol: 'add', line: 4 }), { text: 'add · src/a.js', path: 'src/a.js', line: 4 });
  assert.deepStrictEqual(tools.summary(`${P}findImporters`, { file: 'src/a.js' }), { text: 'src/a.js', path: 'src/a.js', line: undefined });
  assert.deepStrictEqual(tools.summary(`${P}documentSymbols`, { file: 'a.js', kind: 'function' }), { text: 'function · a.js', path: 'a.js', line: undefined });
  assert.deepStrictEqual(tools.summary(`${P}callHierarchy`, { file: 'a.js', symbol: 'f', direction: 'incoming', line: 2 }), { text: 'f incoming · a.js', path: 'a.js', line: 2 });
  assert.deepStrictEqual(tools.summary(`${P}workspaceSymbols`, { query: 'Shop', kind: 'class' }), { text: 'Shop · class' });
  // Other MCP tools keep the generic summary (no path).
  assert.strictEqual(tools.summary('mcp__other__x', { q: 'hi' }).path, undefined);
});

test('resolvePath: absolute as is; relative to the first root where it exists, else the cwd', () => {
  const ws1 = path.resolve('/ws1');
  const ws2 = path.resolve('/ws2');
  const cwd = path.resolve('/cwd');
  const abs = path.resolve('/x/a.js');
  assert.strictEqual(resolvePath(abs, [ws1], () => false), abs);
  const exists = (p) => p === path.join(ws2, 'src', 'a.js');
  assert.strictEqual(resolvePath('src/a.js', [ws1, ws2, cwd], exists), path.join(ws2, 'src', 'a.js'));
  assert.strictEqual(resolvePath('src/a.js', [ws1, undefined, cwd], () => false), path.join(cwd, 'src', 'a.js'));
  assert.strictEqual(resolvePath('', [cwd], () => true), '');
});
