// Code navigation tools (package H prototype): documentSymbols, readSymbol, findReferences.
// No VS Code require: the caller injects the providers (see createNavTools), so this is testable alone.
const path = require('path');

const MAX_RESULTS = 50;
const MAX_CHARS = 2000;
const NO_ACCESS = 'no access: the path is outside the open workspace folders';
const NO_PROVIDER = 'no language provider for this file type; use Grep';

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

const TOOLS = [
  {
    name: 'documentSymbols',
    description: 'List the symbols (functions, classes, variables) of a file with line ranges.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path' },
        kind: { type: 'string', enum: ['function', 'class', 'variable'], description: 'Optional filter' },
      },
      required: ['file'],
    },
  },
  {
    name: 'readSymbol',
    description: 'Read the source of one symbol (function, class) by name, not the whole file.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path' },
        symbol: { type: 'string', description: 'Symbol name' },
      },
      required: ['file', 'symbol'],
    },
  },
  {
    name: 'findReferences',
    description: 'Find where a symbol is used, one source line per place.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path' },
        symbol: { type: 'string', description: 'Symbol name' },
      },
      required: ['file', 'symbol'],
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

function findSymbol(symbols, name, line) {
  const matches = flatten(symbols).filter((s) => s.name === name);
  if (!matches.length) return null;
  if (line !== undefined && line !== null) {
    const l = Number(line) - 1; // tool lines are 1-based
    const hit = matches.find((s) => s.range.start.line <= l && l <= s.range.end.line);
    if (hit) return hit;
  }
  return matches[0];
}

// Position (selection range start) of a DocumentSymbol found by name; line (1-based) disambiguates.
function resolveSymbolPosition(symbols, name, line) {
  const s = findSymbol(symbols, name, line);
  if (!s) return null;
  const r = s.selectionRange || s.range;
  return { line: r.start.line, character: r.start.character };
}

function filePathOf(loc) {
  const u = loc && (loc.uri || loc.targetUri);
  if (!u) return '';
  return typeof u === 'string' ? u : u.fsPath || u.path || '';
}

function createNavTools(deps) {
  const folders = deps.workspaceFolders || [];

  function resolvePath(file) {
    const f = String(file || '');
    if (!f) return null;
    const abs = path.isAbsolute(f) ? f : path.join(folders[0] || '', f);
    return isInsideWorkspace(abs, folders) ? abs : null;
  }

  async function loadSymbols(abs) {
    const uri = deps.toUri(abs);
    if (deps.openDocument) await deps.openDocument(uri);
    const symbols = await deps.executeDocumentSymbolProvider(uri);
    return { uri, symbols: Array.isArray(symbols) ? symbols : [] };
  }

  async function fileLines(abs) {
    return (await deps.readFile(abs)).split(/\r?\n/);
  }

  async function documentSymbols(args) {
    const abs = resolvePath(args.file);
    if (!abs) return { text: NO_ACCESS };
    const { symbols } = await loadSymbols(abs);
    if (!symbols.length) return { text: NO_PROVIDER };
    let flat = flatten(symbols);
    const group = KIND_GROUPS[args.kind];
    if (args.kind && !group) return { error: 'kind must be function, class or variable' };
    if (group) flat = flat.filter((s) => group.includes(s.kind));
    if (!flat.length) return { text: 'no matching symbols' };
    const lines = flat.map((s) => `${KIND_NAMES[s.kind] || 'symbol'} ${s.name} lines ${s.range.start.line + 1}-${s.range.end.line + 1}`);
    return { text: capLines(lines) };
  }

  async function readSymbol(args) {
    const abs = resolvePath(args.file);
    if (!abs) return { text: NO_ACCESS };
    const { symbols } = await loadSymbols(abs);
    if (!symbols.length) return { text: NO_PROVIDER };
    const s = findSymbol(symbols, String(args.symbol || ''), args.line);
    if (!s) return { text: `symbol "${args.symbol}" not found in this file` };
    const lines = (await fileLines(abs)).slice(s.range.start.line, s.range.end.line + 1);
    return { text: capLines(lines, Infinity, MAX_CHARS) };
  }

  async function findReferences(args) {
    const abs = resolvePath(args.file);
    if (!abs) return { text: NO_ACCESS };
    const name = String(args.symbol || '');
    const { uri, symbols } = await loadSymbols(abs);
    let pos = resolveSymbolPosition(symbols, name, args.line);
    if (!pos && deps.findSymbolPosition) pos = await deps.findSymbolPosition(uri, name);
    if (!pos) return { text: symbols.length ? `symbol "${name}" not found in this file` : NO_PROVIDER };
    const refs = await deps.executeReferenceProvider(uri, pos);
    if (!Array.isArray(refs) || !refs.length) return { text: 'no references found' };
    const byFile = new Map();
    for (const r of refs) {
      const p = filePathOf(r);
      if (!p || !isInsideWorkspace(p, folders)) continue;
      if (!byFile.has(p)) byFile.set(p, []);
      byFile.get(p).push(r.range.start.line);
    }
    const items = [];
    for (const [p, nums] of byFile) {
      let src = null;
      try { src = await fileLines(p); } catch { src = null; }
      const rel = path.relative(folders.find((f) => isInsideWorkspace(p, [f])) || '', p).replace(/\\/g, '/') || p;
      for (const n of [...new Set(nums)].sort((a, b) => a - b)) {
        const text = src && src[n] !== undefined ? src[n].trim() : '';
        items.push(`${rel}:${n + 1}: ${text}`);
      }
    }
    if (!items.length) return { text: 'no references found' };
    return { text: capLines(items) };
  }

  const impl = { documentSymbols, readSymbol, findReferences };

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

module.exports = { TOOLS, createNavTools, capLines, isInsideWorkspace, resolveSymbolPosition };
