// Code navigation tools (package H): documentSymbols, readSymbol, findReferences, goToDefinition,
// findImporters, workspaceSymbols, hover, callHierarchy.
// Every answer comes from VS Code's own providers. This file only (1) finds the position to ask about,
// (2) makes sure the language server has loaded the files involved, (3) waits for the language server
// on the first call, and (4) shapes and caps the answer.
// Deps (all injected, see nav-vscode.js): workspaceFolders, toUri, openDocument, readFile,
// executeDocumentSymbolProvider(uri), executeReferenceProvider(uri,pos), executeDefinitionProvider(uri,pos),
// executeWorkspaceSymbolProvider(query), executeHoverProvider(uri,pos), prepareCallHierarchy(uri,pos),
// incomingCalls(item), outgoingCalls(item),
// searchWorkspaceText(pattern, folders) -> Promise<Array<{ path, line (1-based), text }>> (array.capped = true when cut).
// Optional for tests: sleep(ms), now(), readyWaitMs. A missing provider makes that tool answer "not available here".
// No VS Code require, so this is testable alone.
const path = require('path');

const MAX_RESULTS = 50;
const MAX_CHARS = 2000;
const NO_ACCESS = 'no access: the path is outside the open workspace folders';
const NOT_AVAILABLE = 'not available here';
const NO_PROVIDER = 'no language provider for this file type; use Grep';
const NOT_READY = 'no answer from the JavaScript/TypeScript language server yet (it may still be starting); try again in a few seconds';
const CALL_NOTE = 'call hierarchy is less reliable in dynamic JavaScript';

const JS_FILE = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/i;
const MODULE_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'];
const READY_WAIT_MS = 20000; // first call after start: wait this long for the language server
const POLL_MS = 250;
const MAX_WARM_FILES = 200; // files opened so the language server includes them in a cross-file search
const MAX_CANDIDATES = 5; // positions tried when the first one gives no answer

// vscode.SymbolKind numbers grouped into the three filter words.
const KIND_NAMES = {
  0: 'file', 1: 'module', 2: 'namespace', 3: 'package', 4: 'class', 5: 'method', 6: 'property',
  7: 'field', 8: 'constructor', 9: 'enum', 10: 'interface', 11: 'function', 12: 'variable',
  13: 'constant', 14: 'string', 15: 'number', 16: 'boolean', 17: 'array', 18: 'object', 19: 'key',
  20: 'null', 21: 'enumMember', 22: 'struct', 23: 'event', 24: 'operator', 25: 'typeParameter',
};
const KIND_GROUPS = {
  function: [5, 8, 11],
  class: [4, 9, 10, 22],
  variable: [6, 7, 12, 13],
};
const FUNC_KINDS = [5, 8, 11];

const fileProp = { type: 'string', description: 'File path' };
const symbolProp = { type: 'string', description: 'Symbol name' };
const lineProp = { type: 'number', description: 'Optional 1-based line to pick between same-named symbols' };
const kindProp = { type: 'string', enum: ['function', 'class', 'variable'], description: 'Optional filter' };

const TOOLS = [
  {
    name: 'documentSymbols',
    description: 'List the symbols (functions, classes, variables) of a file with line ranges.',
    inputSchema: { type: 'object', properties: { file: fileProp, kind: kindProp }, required: ['file'] },
  },
  {
    name: 'readSymbol',
    description: 'Read the source of one symbol (function, class) by name, not the whole file.',
    inputSchema: { type: 'object', properties: { file: fileProp, symbol: symbolProp, line: lineProp }, required: ['file', 'symbol'] },
  },
  {
    name: 'findReferences',
    description: 'Find where a symbol is used, one source line per place.',
    inputSchema: { type: 'object', properties: { file: fileProp, symbol: symbolProp, line: lineProp }, required: ['file', 'symbol'] },
  },
  {
    name: 'goToDefinition',
    description: 'Find where a symbol used or imported in a file is defined, with the declaration line.',
    inputSchema: { type: 'object', properties: { file: fileProp, symbol: symbolProp, line: lineProp }, required: ['file', 'symbol'] },
  },
  {
    name: 'findImporters',
    description: 'Find the files that import this module, one line per file.',
    inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'Module file path' } }, required: ['file'] },
  },
  {
    name: 'workspaceSymbols',
    description: 'Search symbols by name across the workspace.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Name or part of a name' }, kind: kindProp },
      required: ['query'],
    },
  },
  {
    name: 'hover',
    description: 'Get the type/signature and docs of a symbol.',
    inputSchema: { type: 'object', properties: { file: fileProp, symbol: symbolProp, line: lineProp }, required: ['file', 'symbol'] },
  },
  {
    name: 'callHierarchy',
    description: 'List the callers (incoming) or callees (outgoing) of a function.',
    inputSchema: {
      type: 'object',
      properties: {
        file: fileProp,
        symbol: { type: 'string', description: 'Function name' },
        direction: { type: 'string', enum: ['incoming', 'outgoing'], description: 'Callers or callees' },
        line: lineProp,
      },
      required: ['file', 'symbol', 'direction'],
    },
  },
];

// Joins up to `max` items within `maxChars`; adds "N more not shown" when anything was cut.
function capLines(items, max = MAX_RESULTS, maxChars = MAX_CHARS) {
  const list = Array.isArray(items) ? items.map(String) : [];
  const shown = [];
  let used = 0;
  for (const item of list) {
    if (shown.length >= max) break;
    const cost = item.length + (shown.length ? 1 : 0);
    if (used + cost > maxChars) {
      if (!shown.length) { shown.push(item.slice(0, maxChars)); }
      break;
    }
    shown.push(item);
    used += cost;
  }
  const hidden = list.length - shown.length;
  return shown.join('\n') + (hidden > 0 ? `${shown.length ? '\n' : ''}${hidden} more not shown` : '');
}

function norm(p, win) {
  let s = path.resolve(String(p)).replace(/[\\/]+/g, '/').replace(/\/+$/, '');
  if (win) s = s.toLowerCase();
  return s;
}

// True when `p` is a workspace folder or inside one (case-insensitive on Windows).
function isInsideWorkspace(p, folders, platform = process.platform) {
  if (!p || !Array.isArray(folders)) return false;
  const win = platform === 'win32';
  const target = norm(p, win);
  return folders.some((f) => {
    const root = norm(f, win);
    return target === root || target.startsWith(root + '/');
  });
}

function flatten(symbols, out = []) {
  for (const s of symbols || []) {
    out.push(s);
    if (s.children && s.children.length) flatten(s.children, out);
  }
  return out;
}

const covers = (s, l) => s.range.start.line <= l && l <= s.range.end.line;

function findSymbol(symbols, name, line) {
  const matches = flatten(symbols).filter((s) => s.name === name);
  if (!matches.length) return null;
  if (line !== undefined && line !== null) {
    const hit = matches.find((s) => covers(s, Number(line) - 1)); // tool lines are 1-based
    if (hit) return hit;
  }
  return matches[0];
}

function symbolPos(s) {
  const r = s.selectionRange || s.range;
  return { line: r.start.line, character: r.start.character };
}

// Position (selection range start) of a DocumentSymbol found by name; line (1-based) disambiguates.
function resolveSymbolPosition(symbols, name, line) {
  const s = findSymbol(symbols, name, line);
  return s ? symbolPos(s) : null;
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordPattern = (name) => `(?<![\\w$])${escapeRe(name)}(?![\\w$])`;
const isCommentLine = (t) => /^\s*(\/\/|\/\*|\*)/.test(t);

// True when index i of the line sits inside a '...' or "..." string (template literals count as code).
function inQuotes(text, i) {
  let q = null;
  for (let k = 0; k < i; k++) {
    const c = text[k];
    if (c === '\\') { k++; continue; }
    if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c;
  }
  return q !== null;
}

// Every whole-word occurrence of `name` in code (not in comments or plain strings), 0-based positions.
function textPositions(lines, name) {
  const out = [];
  if (!name) return out;
  const re = new RegExp(wordPattern(name), 'g');
  lines.forEach((text, line) => {
    if (isCommentLine(text)) return;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      if (!inQuotes(text, m.index)) out.push({ line, character: m.index });
    }
  });
  return out;
}

// Candidate positions for a name, best first: the declared symbol on the given line, any occurrence on that
// line, the declared symbol, then every occurrence in file order.
function candidatePositions(symbols, lines, name, line) {
  const out = [];
  const add = (p) => { if (p && !out.some((o) => o.line === p.line && o.character === p.character)) out.push(p); };
  const declared = flatten(symbols).filter((s) => s.name === name);
  const text = textPositions(lines, name);
  if (line !== undefined && line !== null) {
    const l = Number(line) - 1;
    const d = declared.find((s) => covers(s, l));
    if (d) add(symbolPos(d));
    text.filter((p) => p.line === l).forEach(add);
  }
  if (declared.length) add(symbolPos(declared[0]));
  text.forEach(add);
  return out;
}

const sameRange = (a, b) => !!a && !!b
  && a.start.line === b.start.line && a.start.character === b.start.character
  && a.end.line === b.end.line && a.end.character === b.end.character;

// Drops "<unknown>"/empty names and export-shorthand property duplicates (same name and range as a function/variable).
function cleanSymbols(flat) {
  const named = flat.filter((s) => s.name && s.name !== '<unknown>');
  return named.filter((s) => s.kind !== 6
    || !named.some((o) => o !== s && o.name === s.name && [11, 12].includes(o.kind) && sameRange(o.range, s.range)));
}

// A variable whose value is a function (`const App = () => ...`, `= function`) is a function: React components.
const FUNCTION_VALUE = /^=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)/;
function isFunctionLike(s, lines) {
  if (FUNC_KINDS.includes(s.kind)) return true;
  if (s.kind !== 12 && s.kind !== 13) return false;
  const start = (s.selectionRange || s.range).start;
  const end = Math.min(s.range.end.line, start.line + 3);
  const decl = lines.slice(start.line, end + 1).join('\n').slice(start.character);
  const eq = decl.indexOf('=');
  return eq >= 0 && FUNCTION_VALUE.test(decl.slice(eq));
}

// The outline: top-level symbols, class and object members; locals inside functions are left out.
function outline(symbols, lines) {
  const out = [];
  const walk = (list) => {
    for (const s of list || []) {
      const fn = isFunctionLike(s, lines);
      out.push({ s, fn });
      if (!fn && s.children && s.children.length) walk(s.children);
    }
  };
  walk(symbols);
  return out;
}

function filePathOf(loc) {
  const u = loc && (loc.uri || loc.targetUri);
  if (!u) return '';
  return typeof u === 'string' ? u : u.fsPath || u.path || '';
}

const has = (a) => Array.isArray(a) && a.length > 0;

function createNavTools(deps) {
  const folders = deps.workspaceFolders || [];
  const win = process.platform === 'win32';
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now || (() => Date.now());
  const readyWaitMs = deps.readyWaitMs === undefined ? READY_WAIT_MS : deps.readyWaitMs;
  let jsReady = false; // the JS/TS language server has answered once in this process

  function resolvePath(file) {
    const f = String(file || '');
    if (!f) return null;
    const abs = path.isAbsolute(f) ? f : path.join(folders[0] || '', f);
    return isInsideWorkspace(abs, folders) ? abs : null;
  }

  function relOf(p) {
    return path.relative(folders.find((f) => isInsideWorkspace(p, [f])) || '', p).replace(/\\/g, '/') || p;
  }

  async function fileLines(abs) {
    return String(await deps.readFile(abs)).split(/\r?\n/);
  }

  async function safeLines(abs) {
    try { return await fileLines(abs); } catch { return null; }
  }

  // Symbols of a file. On the first JS/TS call the language server may still be starting and answer
  // nothing; then poll until it answers or readyWaitMs passes ({ notReady: true }).
  async function loadSymbols(abs) {
    const uri = deps.toUri(abs);
    if (deps.openDocument) await deps.openDocument(uri);
    let symbols = await deps.executeDocumentSymbolProvider(uri);
    const isJs = JS_FILE.test(abs);
    if (isJs && !has(symbols) && !jsReady) {
      const lines = await safeLines(abs);
      if (lines && /\S/.test(lines.join(''))) {
        const end = now() + readyWaitMs;
        while (!has(symbols) && now() < end) {
          await sleep(POLL_MS);
          symbols = await deps.executeDocumentSymbolProvider(uri);
        }
        if (!has(symbols)) return { uri, symbols: [], notReady: true };
      }
    }
    if (isJs && has(symbols)) jsReady = true;
    return { uri, symbols: has(symbols) ? symbols : [] };
  }

  // Text used when a file gave no symbols.
  function emptyText(loaded, abs) {
    if (loaded.notReady) return NOT_READY;
    return JS_FILE.test(abs) ? 'no symbols in this file' : NO_PROVIDER;
  }

  // Opens every workspace JS/TS file that mentions `name`, so the language server includes it in a
  // cross-file search (without a jsconfig.json it only knows open files and what they import).
  // Returns the text hits ({ path, line, text }) inside the workspace.
  async function warmFiles(name) {
    if (!deps.searchWorkspaceText || !name) return [];
    let hits;
    try { hits = await deps.searchWorkspaceText(wordPattern(name), folders); } catch { return []; }
    hits = (hits || []).filter((h) => h && h.path && isInsideWorkspace(h.path, folders));
    if (deps.openDocument) {
      const paths = [...new Set(hits.map((h) => h.path))];
      await Promise.all(paths.slice(0, MAX_WARM_FILES).map((p) => Promise.resolve()
        .then(() => deps.openDocument(deps.toUri(p))).catch(() => {})));
    }
    return hits;
  }

  const targetLine = (t) => { const r = t && (t.targetSelectionRange || t.targetRange || t.range); return r ? r.start.line : null; };
  const locKey = (p, line) => `${norm(p, win)}:${line}`;

  // The language server does not link every use back to its declaration (for example `math.add` after a
  // CommonJS require of an ES module). For each text occurrence of the name that `known` does not hold,
  // ask VS Code for its definition; when it leads to the same declaration, it is a reference too.
  // Returns [{ path, line (0-based), character, call }] (call = the occurrence is followed by "(").
  async function verifiedExtraRefs(at, hits, known) {
    if (!deps.executeDefinitionProvider || !hits.length) return [];
    const decl = await firstAnswer(at, deps.executeDefinitionProvider);
    const declKeys = new Set((Array.isArray(decl) ? decl : []).map((t) => locKey(filePathOf(t), targetLine(t))));
    if (!declKeys.size) return [];
    const extra = [];
    let asked = 0;
    for (const h of hits) {
      const line = h.line - 1;
      if (known.has(locKey(h.path, line))) continue;
      for (const p of textPositions([String(h.text || '')], at.name)) {
        if (asked++ >= MAX_RESULTS * 2) return extra;
        const defs = await deps.executeDefinitionProvider(deps.toUri(h.path), { line, character: p.character });
        if (!(Array.isArray(defs) ? defs : []).some((t) => declKeys.has(locKey(filePathOf(t), targetLine(t))))) continue;
        const after = String(h.text).slice(p.character + at.name.length);
        extra.push({ path: h.path, line, character: p.character, call: /^\s*\(/.test(after) });
        known.add(locKey(h.path, line));
        break;
      }
    }
    return extra;
  }

  // Line numbers (0-based) that belong to import statements or require(...) lines.
  function importLines(lines) {
    const set = new Set();
    const text = lines.join('\n');
    const lineAt = (i) => text.slice(0, i).split('\n').length - 1;
    const re = /^[ \t]*import\b[\s\S]*?(?:from\s*)?['"][^'"\n]+['"]/gm;
    let m;
    while ((m = re.exec(text))) {
      for (let l = lineAt(m.index); l <= lineAt(m.index + m[0].length); l++) set.add(l);
    }
    lines.forEach((t, i) => { if (/\brequire\s*\(\s*['"]/.test(t)) set.add(i); });
    return set;
  }

  // file + symbol (+ line) -> { uri, abs, name, positions } or { text }.
  async function locate(args) {
    const abs = resolvePath(args.file);
    if (!abs) return { text: NO_ACCESS };
    const name = String(args.symbol || '').trim();
    if (!name) return { text: 'give a symbol name' };
    const loaded = await loadSymbols(abs);
    if (loaded.notReady) return { text: NOT_READY };
    if (!loaded.symbols.length && !JS_FILE.test(abs)) return { text: NO_PROVIDER };
    const lines = (await safeLines(abs)) || [];
    const positions = candidatePositions(loaded.symbols, lines, name, args.line).slice(0, MAX_CANDIDATES);
    if (!positions.length) return { text: `symbol "${name}" not found in this file` };
    return { uri: loaded.uri, abs, name, positions };
  }

  // Asks the provider at each candidate position until one gives a non-empty answer.
  async function firstAnswer(at, ask, keep = has) {
    let last = null;
    for (const pos of at.positions) {
      last = await ask(at.uri, pos);
      if (keep(last)) return last;
    }
    return last;
  }

  async function documentSymbols(args) {
    const abs = resolvePath(args.file);
    if (!abs) return { text: NO_ACCESS };
    const group = KIND_GROUPS[args.kind];
    if (args.kind && !group) return { error: 'kind must be function, class or variable' };
    const loaded = await loadSymbols(abs);
    if (!loaded.symbols.length) return { text: emptyText(loaded, abs) };
    const lines = (await safeLines(abs)) || [];
    const keep = new Set(cleanSymbols(flatten(loaded.symbols)));
    let list = outline(loaded.symbols, lines).filter((o) => keep.has(o.s));
    if (group) {
      list = list.filter((o) => (args.kind === 'function' ? o.fn : group.includes(o.s.kind) && !o.fn));
    }
    if (!list.length) return { text: 'no matching symbols' };
    list.sort((a, b) => a.s.range.start.line - b.s.range.start.line);
    const label = (o) => (o.fn && !FUNC_KINDS.includes(o.s.kind) ? 'function' : KIND_NAMES[o.s.kind] || 'symbol');
    return { text: capLines(list.map((o) => `${label(o)} ${o.s.name} lines ${o.s.range.start.line + 1}-${o.s.range.end.line + 1}`)) };
  }

  async function readSymbol(args) {
    const abs = resolvePath(args.file);
    if (!abs) return { text: NO_ACCESS };
    const loaded = await loadSymbols(abs);
    if (!loaded.symbols.length) return { text: emptyText(loaded, abs) };
    const s = findSymbol(loaded.symbols, String(args.symbol || '').trim(), args.line);
    if (!s) return { text: `symbol "${args.symbol}" is not declared in this file; goToDefinition finds where it is` };
    const lines = (await fileLines(abs)).slice(s.range.start.line, s.range.end.line + 1);
    return { text: capLines(lines, Infinity, MAX_CHARS) };
  }

  async function findReferences(args) {
    if (!deps.executeReferenceProvider) return { text: NOT_AVAILABLE };
    const at = await locate(args);
    if (!at.positions) return at;
    const hits = await warmFiles(at.name);
    const found = await firstAnswer(at, deps.executeReferenceProvider);
    const refs = (Array.isArray(found) ? found : [])
      .filter((r) => r && r.range && filePathOf(r))
      .map((r) => ({ path: filePathOf(r), line: r.range.start.line }));
    const known = new Set(refs.map((r) => locKey(r.path, r.line)));
    refs.push(...await verifiedExtraRefs(at, hits, known));
    if (!refs.length) return { text: 'no references found' };
    const byFile = new Map();
    for (const r of refs) {
      if (!isInsideWorkspace(r.path, folders)) continue;
      if (!byFile.has(r.path)) byFile.set(r.path, []);
      byFile.get(r.path).push(r.line);
    }
    const items = [];
    for (const [p, nums] of [...byFile].sort((a, b) => relOf(a[0]).localeCompare(relOf(b[0])))) {
      const src = await safeLines(p);
      for (const n of [...new Set(nums)].sort((a, b) => a - b)) {
        items.push(`${relOf(p)}:${n + 1}: ${src && src[n] !== undefined ? src[n].trim() : ''}`);
      }
    }
    if (!items.length) return { text: 'no references found' };
    return { text: capLines(items) };
  }

  async function goToDefinition(args) {
    if (!deps.executeDefinitionProvider) return { text: NOT_AVAILABLE };
    const at = await locate(args);
    if (!at.positions) return at;
    // A definition that stops at an import in this same file is an alias, not the declaration:
    // try the next occurrence of the name (a use site), which the language server follows through.
    const imports = importLines((await safeLines(at.abs)) || []);
    const isAlias = (t) => norm(filePathOf(t), win) === norm(at.abs, win) && imports.has(targetLine(t));
    const ask = async () => {
      let first = null;
      for (const pos of at.positions) {
        const got = await deps.executeDefinitionProvider(at.uri, pos);
        if (!has(got)) continue;
        if (!got.every(isAlias)) return got;
        first = first || got;
      }
      return first;
    };
    let targets = await ask();
    if (has(targets) && targets.every(isAlias)) {
      // The language server could not follow the import (for example a .jsx module that is not open and
      // no jsconfig.json): resolve the module path, open it, ask again; else find the name in that module.
      const mod = await importedModule(at.abs, targetLine(targets[0]));
      if (mod) {
        if (deps.openDocument) { try { await deps.openDocument(deps.toUri(mod)); } catch { /* ignore */ } }
        const again = await ask();
        if (has(again) && !again.every(isAlias)) targets = again;
        else {
          const loaded = await loadSymbols(mod);
          const s = findSymbol(loaded.symbols, at.name);
          if (s) targets = [{ uri: { fsPath: mod }, range: s.selectionRange || s.range }];
        }
      }
    }
    const items = [];
    const seen = new Set();
    let outside = 0;
    for (const t of Array.isArray(targets) ? targets : []) {
      const p = filePathOf(t);
      const r = t && (t.targetSelectionRange || t.targetRange || t.range);
      if (!p || !r) continue;
      if (!isInsideWorkspace(p, folders)) { outside++; continue; }
      const n = r.start.line;
      if (seen.has(p + ':' + n)) continue;
      seen.add(p + ':' + n);
      const src = await safeLines(p);
      items.push(`${relOf(p)}:${n + 1} ${src && src[n] !== undefined ? src[n].trim() : ''}`);
    }
    if (items.length) return { text: capLines(items) };
    return { text: outside ? 'defined outside the open workspace folders (a library or built-in)' : 'no definition found' };
  }

  // Module specifiers in one line: from '...', import '...', import('...'), require('...').
  const SPEC_RE = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*(['"`])([^'"`]+)\1/g;

  // True when relative specifier `spec`, written in `fromFile`, points at `target` (Node/bundler resolution).
  function resolvesTo(fromFile, spec, target) {
    const base = path.resolve(path.dirname(fromFile), spec);
    const stem = MODULE_EXTS.includes(path.extname(base).toLowerCase()) ? base.slice(0, -path.extname(base).length) : null;
    const cands = [base, ...MODULE_EXTS.map((e) => base + e), ...MODULE_EXTS.map((e) => path.join(base, 'index' + e))];
    if (stem) cands.push(...MODULE_EXTS.map((e) => stem + e));
    const t = norm(target, win);
    return cands.some((c) => norm(c, win) === t);
  }

  // The existing file a relative import statement starting at or above `line` of `abs` points at, or null.
  async function importedModule(abs, line) {
    const lines = (await safeLines(abs)) || [];
    if (line === null || line === undefined) return null;
    const m = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*(['"])([^'"\n]+)\1/.exec(lines.slice(line, line + 30).join('\n'));
    if (!m || !m[2].startsWith('.')) return null;
    const base = path.resolve(path.dirname(abs), m[2]);
    const cands = [base, ...MODULE_EXTS.map((e) => base + e), ...MODULE_EXTS.map((e) => path.join(base, 'index' + e))];
    for (const c of cands) {
      if (MODULE_EXTS.includes(path.extname(c).toLowerCase()) && isInsideWorkspace(c, folders) && (await safeLines(c))) return c;
    }
    return null;
  }

  async function findImporters(args) {
    if (!deps.searchWorkspaceText) return { text: NOT_AVAILABLE };
    const abs = resolvePath(args.file);
    if (!abs) return { text: NO_ACCESS };
    const self = norm(abs, win);
    const base = path.basename(abs, path.extname(abs));
    const names = [base];
    if (base === 'index') names.push(path.basename(path.dirname(abs)));
    const alt = names.map(escapeRe).join('|');
    const pattern = `(?:\\bfrom|\\bimport|\\brequire)\\s*\\(?\\s*['"\`][^'"\`]*(?:${alt})(?:\\.\\w+)?['"\`]`;
    const hits = await deps.searchWorkspaceText(pattern, folders);
    const items = [];
    const seen = new Set();
    for (const h of Array.isArray(hits) ? hits : []) {
      if (!h || !h.path || seen.has(h.path) || !isInsideWorkspace(h.path, folders) || norm(h.path, win) === self) continue;
      const text = String(h.text || '');
      if (isCommentLine(text)) continue;
      let verdict = null; // 'yes' | 'unverified'
      SPEC_RE.lastIndex = 0;
      let m;
      while (!verdict && (m = SPEC_RE.exec(text))) {
        const spec = m[2];
        if (inQuotes(text, m.index)) continue;
        if (spec.startsWith('.') || path.isAbsolute(spec)) {
          if (resolvesTo(h.path, spec, abs)) verdict = 'yes';
          continue;
        }
        // A bare or aliased specifier (jsconfig "paths", a package): only its last part can name this file.
        const last = spec.split('/').pop().replace(/\.\w+$/, '');
        if (!names.includes(last)) continue;
        if (!deps.executeDefinitionProvider) { verdict = 'unverified'; continue; }
        // Ask VS Code where the specifier leads (definition on a module string opens the module file).
        const uri = deps.toUri(h.path);
        if (deps.openDocument) { try { await deps.openDocument(uri); } catch { /* deleted meanwhile */ } }
        const col = m.index + m[0].length - spec.length - 1;
        const targets = await deps.executeDefinitionProvider(uri, { line: h.line - 1, character: col + 1 });
        if ((Array.isArray(targets) ? targets : []).some((t) => norm(filePathOf(t), win) === self)) verdict = 'yes';
      }
      if (!verdict) continue;
      seen.add(h.path);
      items.push(`${relOf(h.path)}:${h.line} ${text.trim()}${verdict === 'unverified' ? ' [unverified]' : ''}`);
    }
    items.sort();
    const note = hits && hits.capped ? '\n(text search stopped at its limit; there may be more importers)' : '';
    return { text: (items.length ? capLines(items) : 'no importers found') + note };
  }

  async function workspaceSymbols(args) {
    if (!deps.executeWorkspaceSymbolProvider) return { text: NOT_AVAILABLE };
    const query = String(args.query || '').trim();
    if (!query) return { text: 'give a non-empty query' };
    const group = KIND_GROUPS[args.kind];
    if (args.kind && !group) return { error: 'kind must be function, class or variable' };
    const found = await deps.executeWorkspaceSymbolProvider(query);
    const items = [];
    for (const s of Array.isArray(found) ? found : []) {
      const p = filePathOf(s.location);
      if (!p || !isInsideWorkspace(p, folders) || (group && !group.includes(s.kind))) continue;
      const r = s.location.range;
      items.push(`${KIND_NAMES[s.kind] || 'symbol'} ${s.name} ${relOf(p)}:${(r ? r.start.line : 0) + 1}`);
    }
    return { text: items.length ? capLines(items) : 'no symbols match' };
  }

  const hoverPart = (c) => (typeof c === 'string' ? c : c && typeof c.value === 'string' ? c.value : '');
  // Plain text: no Markdown code fences, no "(loading...)" marker from a language server still loading.
  const cleanHover = (t) => t.replace(/^```\w*\s*$/gm, '').replace(/\(loading\.\.\.\)\s*/g, '').replace(/\n{3,}/g, '\n\n').trim();

  async function hover(args) {
    if (!deps.executeHoverProvider) return { text: NOT_AVAILABLE };
    const at = await locate(args);
    if (!at.positions) return at;
    const toText = (hovers) => {
      const parts = [];
      for (const h of Array.isArray(hovers) ? hovers : []) {
        const cs = h && h.contents;
        for (const c of Array.isArray(cs) ? cs : [cs]) {
          const t = cleanHover(hoverPart(c));
          if (t) parts.push(t);
        }
      }
      return parts.join('\n\n').trim();
    };
    const hovers = await firstAnswer(at, deps.executeHoverProvider, (h) => !!toText(h));
    const text = toText(hovers);
    return { text: text ? text.slice(0, MAX_CHARS) : 'no hover info' };
  }

  async function callHierarchy(args) {
    if (!deps.prepareCallHierarchy) return { text: NOT_AVAILABLE };
    const dir = args.direction;
    if (dir !== 'incoming' && dir !== 'outgoing') return { error: 'direction must be incoming or outgoing' };
    const fetchCalls = dir === 'incoming' ? deps.incomingCalls : deps.outgoingCalls;
    if (!fetchCalls) return { text: NOT_AVAILABLE };
    const at = await locate(args);
    if (!at.positions) return at;
    const hits = dir === 'incoming' ? await warmFiles(at.name) : [];
    const prepared = await firstAnswer(at, deps.prepareCallHierarchy, (p) => !!(Array.isArray(p) ? p[0] : p));
    const item = Array.isArray(prepared) ? prepared[0] : prepared;
    if (!item) return { text: 'no call hierarchy here (not supported for this language)' };
    const calls = await fetchCalls(item);
    const items = [];
    const callers = []; // { path, range } of the incoming callers already listed
    for (const c of Array.isArray(calls) ? calls : []) {
      const it = c && (dir === 'incoming' ? c.from : c.to);
      const p = it && filePathOf(it);
      if (!p || !isInsideWorkspace(p, folders)) continue;
      const r = it.selectionRange || it.range;
      items.push(`${it.name} ${relOf(p)}:${(r ? r.start.line : 0) + 1}`);
      if (it.range) callers.push({ path: p, range: it.range });
    }
    // Calls the language server did not link (see verifiedExtraRefs): add their enclosing function.
    if (dir === 'incoming' && deps.executeReferenceProvider && hits.length) {
      const found = await firstAnswer(at, deps.executeReferenceProvider);
      const known = new Set((Array.isArray(found) ? found : []).filter((r) => r && r.range)
        .map((r) => locKey(filePathOf(r), r.range.start.line)));
      for (const x of await verifiedExtraRefs(at, hits, known)) {
        if (!x.call || callers.some((c) => norm(c.path, win) === norm(x.path, win) && covers(c, x.line))) continue;
        const loaded = await loadSymbols(x.path);
        const src = (await safeLines(x.path)) || [];
        // The innermost named function around the call (an anonymous "x.reduce() callback" is skipped).
        const around = flatten(loaded.symbols)
          .filter((s) => covers(s, x.line) && isFunctionLike(s, src))
          .sort((a, b) => (a.range.end.line - a.range.start.line) - (b.range.end.line - b.range.start.line));
        const enclosing = around.find((s) => !/\bcallback$/.test(s.name)) || around[0];
        const name = enclosing ? enclosing.name : '(top level)';
        const line = enclosing ? symbolPos(enclosing).line : x.line;
        items.push(`${name} ${relOf(x.path)}:${line + 1}`);
        callers.push({ path: x.path, range: enclosing ? enclosing.range : { start: { line: x.line }, end: { line: x.line } } });
      }
    }
    if (!items.length) return { text: `no ${dir} calls found` };
    return { text: capLines(items, MAX_RESULTS, MAX_CHARS - CALL_NOTE.length - 1) + '\n' + CALL_NOTE };
  }

  const impl = { documentSymbols, readSymbol, findReferences, goToDefinition, findImporters, workspaceSymbols, hover, callHierarchy };

  async function call(name, args) {
    const fn = impl[name];
    if (!fn) return { error: `unknown tool: ${name}` };
    try {
      return await fn(args || {});
    } catch (e) {
      return { error: String((e && e.message) || e).slice(0, 200) };
    }
  }

  return { list: TOOLS, call };
}

module.exports = { TOOLS, createNavTools, capLines, isInsideWorkspace, resolveSymbolPosition, textPositions };
