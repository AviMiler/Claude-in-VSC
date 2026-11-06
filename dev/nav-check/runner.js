// Runs the eight navigation tools (src/mcp/nav-*.js) inside a real VS Code through the real nav server
// over HTTP (JSON-RPC tools/call with the Bearer token, as the CLI calls them), against ./fixture, and
// compares every answer with the expected answer written by hand from the fixture's source.
// How to run and what the report means: dev/README.md, section "Navigation tools in real VS Code".
const fs = require('fs');
const http = require('http');
const path = require('path');
const vscode = require('vscode');
const { createNavTools } = require('../../src/mcp/nav-tools');
const { createVscodeNavDeps } = require('../../src/mcp/nav-vscode');
const { startNavServer } = require('../../src/mcp/nav-server');

const OUT = process.env.RESULT_FILE || path.join(__dirname, 'nav-check-report.txt');
const lines = [];
const out = (s) => { lines.push(s); fs.writeFileSync(OUT, lines.join('\n') + '\n'); };

function post(srv, body, auth = true) {
  return new Promise((resolve, reject) => {
    const u = new URL(srv.url);
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers.Authorization = `Bearer ${srv.token}`;
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

let id = 1;
let passed = 0;
let failed = 0;

async function call(srv, name, args) {
  const t0 = Date.now();
  const r = await post(srv, { jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } });
  const j = JSON.parse(r.body);
  const text = j.error ? `RPC ERROR ${j.error.code}: ${j.error.message}` : (j.result.isError ? 'isError: ' : '') + j.result.content[0].text;
  return { text, ms: Date.now() - t0 };
}

// "file:line" keys of a list answer ("src/a.js:3: text", "src/a.js:3 text", "name src/a.js:3").
const keys = (text) => text.split('\n').map((l) => (l.match(/(src\/[\w./-]+):(\d+)/) || [])[0]).filter(Boolean).sort();
const firstWords = (text) => text.split('\n').filter((l) => / src\//.test(l)).map((l) => l.split(' ')[0]).sort();
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

async function check(srv, label, name, args, expect, test) {
  const { text, ms } = await call(srv, name, args);
  const ok = !!test(text);
  if (ok) passed++; else failed++;
  out(`\n### ${ok ? 'PASS' : 'FAIL'} ${label}\n${name} ${JSON.stringify(args)}  (${ms} ms)\nexpected: ${expect}\n--- answer ---\n${text}`);
}

exports.run = async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const jsconfig = fs.existsSync(path.join(root, 'jsconfig.json'));
  out(`VS Code ${vscode.version} on ${process.platform}; jsconfig.json: ${jsconfig}; ${new Date().toISOString()}`);
  const srv = await startNavServer({ tools: createNavTools(createVscodeNavDeps()), log: () => {} });

  const init = await post(srv, { jsonrpc: '2.0', id: id++, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  const list = await post(srv, { jsonrpc: '2.0', id: id++, method: 'tools/list' });
  const noAuth = await post(srv, {}, false);
  const toolNames = JSON.parse(list.body).result.tools.map((t) => t.name);
  out(`initialize ${init.status}; tools/list ${list.status} (${list.body.length} chars): ${toolNames.join(', ')}; without token ${noAuth.status}`);
  const protoOk = init.status === 200 && toolNames.length === 8 && noAuth.status === 401;
  if (protoOk) passed++; else failed++;
  out(`### ${protoOk ? 'PASS' : 'FAIL'} protocol: initialize 200, 8 tools, 401 without token`);

  const C = (label, name, args, expect, test) => check(srv, label, name, args, expect, test);

  // Order matters: the first calls run before any other file is open (the hardest case).
  await C('cold start: first call waits for the language server', 'documentSymbols', { file: 'src/math.js' },
    'add, multiply, PI, Calculator, constructor, plus in line order',
    (t) => t.split('\n').map((l) => l.split(' ')[1]).join(',') === 'add,multiply,PI,Calculator,constructor,plus');
  await C('incoming calls cross files (CommonJS caller too)', 'callHierarchy', { file: 'src/math.js', symbol: 'add', direction: 'incoming' },
    'callers multiply, plus, formatSum, legacyTotal and nothing from src/other',
    (t) => sameSet(t.split('\n').filter((l) => / src\//.test(l)),
      ['multiply src/math.js:5', 'plus src/math.js:17', 'formatSum src/utils/format.js:9', 'legacyTotal src/legacy.js:3']));
  await C('references of an imported name, through re-exports', 'findReferences', { file: 'src/App.jsx', symbol: 'formatSum' },
    'utils/format.js:9, App.jsx:3, App.jsx:16, utils/index.js:1, api.js:2, consumer.js:1, consumer.js:2',
    (t) => sameSet(new Set(keys(t)), ['src/utils/format.js:9', 'src/App.jsx:3', 'src/App.jsx:16', 'src/utils/index.js:1', 'src/api.js:2', 'src/consumer.js:1', 'src/consumer.js:2']));
  await C('references of add: all files, no decoy, no comment, no string', 'findReferences', { file: 'src/math.js', symbol: 'add' },
    'math.js:1, math.js:7, math.js:18, utils/format.js:1, utils/format.js:10, legacy.js:4',
    (t) => sameSet(keys(t), ['src/math.js:1', 'src/math.js:7', 'src/math.js:18', 'src/utils/format.js:1', 'src/utils/format.js:10', 'src/legacy.js:4']));
  await C('references of multiply (multi-line import)', 'findReferences', { file: 'src/math.js', symbol: 'multiply' },
    'math.js:5, App.jsx:2, App.jsx:7, report.js:3, report.js:9',
    (t) => sameSet(keys(t), ['src/math.js:5', 'src/App.jsx:2', 'src/App.jsx:7', 'src/report.js:3', 'src/report.js:9']));

  await C('importers: ESM, multi-line, CommonJS, import(), side effect, re-export; not the decoy, not a comment', 'findImporters', { file: 'src/math.js' },
    'App.jsx, utils/format.js, legacy.js, dynamic.js, report.js, api.js, lazy.js, setup.js',
    (t) => sameSet(keys(t).map((k) => k.split(':')[0]), ['src/App.jsx', 'src/utils/format.js', 'src/legacy.js', 'src/dynamic.js', 'src/report.js', 'src/api.js', 'src/lazy.js', 'src/setup.js']));
  await C('importers of the same-named decoy module', 'findImporters', { file: 'src/other/math.js' }, 'other/use.js only',
    (t) => sameSet(keys(t).map((k) => k.split(':')[0]), ['src/other/use.js']));
  await C('importers of format.js', 'findImporters', { file: 'src/utils/format.js' }, 'App.jsx, utils/index.js, api.js',
    (t) => sameSet(keys(t).map((k) => k.split(':')[0]), ['src/App.jsx', 'src/utils/index.js', 'src/api.js']));
  await C('importers of a folder index', 'findImporters', { file: 'src/utils/index.js' }, 'consumer.js',
    (t) => sameSet(keys(t).map((k) => k.split(':')[0]), ['src/consumer.js']));
  await C('importers of a component', 'findImporters', { file: 'src/components/Button.jsx' }, 'App.jsx',
    (t) => sameSet(keys(t).map((k) => k.split(':')[0]), ['src/App.jsx']));
  await C('importers of App', 'findImporters', { file: 'src/App.jsx' }, 'index.js',
    (t) => sameSet(keys(t).map((k) => k.split(':')[0]), ['src/index.js']));

  await C('definition of an imported function', 'goToDefinition', { file: 'src/App.jsx', symbol: 'formatSum' }, 'utils/format.js:9',
    (t) => sameSet(keys(t), ['src/utils/format.js:9']));
  await C('definition through a folder index re-export', 'goToDefinition', { file: 'src/consumer.js', symbol: 'formatSum' }, 'utils/format.js:9',
    (t) => sameSet(keys(t), ['src/utils/format.js:9']));
  await C('definition of an imported arrow component', 'goToDefinition', { file: 'src/App.jsx', symbol: 'Button' }, 'components/Button.jsx:3',
    (t) => sameSet(keys(t), ['src/components/Button.jsx:3']));
  await C('definition of a default import', 'goToDefinition', { file: 'src/App.jsx', symbol: 'Calculator' }, 'math.js:13',
    (t) => sameSet(keys(t), ['src/math.js:13']));
  await C('definition through CommonJS require (math.add)', 'goToDefinition', { file: 'src/legacy.js', symbol: 'add' }, 'math.js:1',
    (t) => sameSet(keys(t), ['src/math.js:1']));
  await C('definition picks the right same-named module', 'goToDefinition', { file: 'src/other/use.js', symbol: 'add' }, 'other/math.js:1',
    (t) => sameSet(keys(t), ['src/other/math.js:1']));
  await C('definition of a local declaration', 'goToDefinition', { file: 'src/App.jsx', symbol: 'App' }, 'App.jsx:10',
    (t) => sameSet(keys(t), ['src/App.jsx:10']));

  await C('outline without locals', 'documentSymbols', { file: 'src/App.jsx' }, 'handlers 6-8, double 7, App 10-19 (no n, setN, calc)',
    (t) => t === 'variable handlers lines 6-8\nmethod double lines 7-7\nfunction App lines 10-19');
  await C('arrow component counts as a function', 'documentSymbols', { file: 'src/components/Button.jsx', kind: 'function' }, 'function Button lines 3-5',
    (t) => t === 'function Button lines 3-5');
  await C('kind=function finds arrow functions', 'documentSymbols', { file: 'src/report.js', kind: 'function' }, 'area, describe',
    (t) => t === 'function area lines 9-9\nfunction describe lines 11-13');
  await C('kind=variable leaves arrow functions out', 'documentSymbols', { file: 'src/report.js', kind: 'variable' }, 'label only',
    (t) => t === 'variable label lines 7-7');
  await C('no provider for C#', 'documentSymbols', { file: 'src/Program.cs' }, 'no language provider ... use Grep', (t) => /use Grep/.test(t));
  await C('path limit (relative)', 'documentSymbols', { file: '../outside.js' }, 'no access', (t) => t.startsWith('no access'));
  await C('path limit (absolute)', 'readSymbol', { file: path.join(root, '..', 'outside.js'), symbol: 'secret' }, 'no access', (t) => t.startsWith('no access'));

  await C('readSymbol of a component', 'readSymbol', { file: 'src/App.jsx', symbol: 'App' }, 'lines 10-19 exactly',
    (t) => t.startsWith('export default function App() {') && t.endsWith('}') && t.split('\n').length === 10);
  await C('readSymbol of a method', 'readSymbol', { file: 'src/math.js', symbol: 'plus' }, 'lines 17-20',
    (t) => t.split('\n').length === 4 && t.trim().startsWith('plus(n) {'));
  await C('readSymbol of an imported name points to goToDefinition', 'readSymbol', { file: 'src/App.jsx', symbol: 'formatSum' }, 'not declared ... goToDefinition',
    (t) => /not declared/.test(t) && /goToDefinition/.test(t));
  await C('a name only in a comment and a string is not a symbol', 'findReferences', { file: 'src/report.js', symbol: 'add' }, 'not found in this file',
    (t) => /not found in this file/.test(t));

  await C('hover of a declaration, plain text', 'hover', { file: 'src/utils/format.js', symbol: 'formatSum' }, 'signature + JSDoc, no fences, no (loading...)',
    (t) => t.includes('formatSum(a: number, b: number): string') && t.includes('Formats the sum') && !t.includes('```') && !t.includes('loading'));
  await C('hover of an imported name', 'hover', { file: 'src/App.jsx', symbol: 'formatSum' }, 'the same signature',
    (t) => t.includes('formatSum(a: number, b: number): string'));

  await C('outgoing calls', 'callHierarchy', { file: 'src/math.js', symbol: 'multiply', direction: 'outgoing' }, 'add math.js:1',
    (t) => sameSet(keys(t), ['src/math.js:1']));
  await C('outgoing calls of a component', 'callHierarchy', { file: 'src/App.jsx', symbol: 'App', direction: 'outgoing' }, 'includes Calculator, plus, Button, formatSum',
    (t) => ['Calculator', 'plus', 'Button', 'formatSum'].every((n) => firstWords(t).includes(n)));
  await C('incoming calls of an imported name', 'callHierarchy', { file: 'src/consumer.js', symbol: 'formatSum', direction: 'incoming' }, 'App and show',
    (t) => sameSet(firstWords(t), ['App', 'show']));

  await C('workspace symbol search', 'workspaceSymbols', { query: 'formatSum' }, 'function in utils/format.js:9',
    (t) => keys(t).includes('src/utils/format.js:9'));
  await C('workspace symbol search, class filter', 'workspaceSymbols', { query: 'Calc', kind: 'class' }, 'Calculator math.js:13 only',
    (t) => sameSet(keys(t), ['src/math.js:13']));

  await srv.close();
  out(`\nRESULT: ${passed} passed, ${failed} failed (of ${passed + failed})`);
};
