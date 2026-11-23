// New diagnostics after Claude's edits (M-1 part b, PLAN.md section 11): the pure tracker and the English `<ide_diagnostics>` block sent with the user's next message.
// No vscode dependency: the diagnostics come from an injected source (src/tagging/diagnostics-vscode.js).
// Flow: a final Edit/MultiEdit/Write tool event captures the file's diagnostics as a baseline (before
// the tool runs); a non-error tool result marks the file edited and starts a bounded settle wait;
// takeBlock() at the next real send lists only the errors and warnings that are new against the
// baseline, once, and forgets the files.
const path = require('path');

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write']);
const MAX_ITEMS = 20;
const MAX_CHARS = 1500;
const SETTLE_MS = 1500;
const MESSAGE_MAX = 300;

function norm(p, win) {
  let s = path.resolve(String(p)).replace(/[\\/]+/g, '/').replace(/\/+$/, '');
  if (win) s = s.toLowerCase();
  return s;
}

// insideFolders(p: string, folders: string[], platform?: string) -> boolean
// True when `p` is a workspace folder or inside one (case-insensitive on Windows), like the nav tools.
function insideFolders(p, folders, platform = process.platform) {
  if (!p || !Array.isArray(folders)) return false;
  const win = platform === 'win32';
  const target = norm(p, win);
  return folders.some((f) => {
    const root = norm(f, win);
    return target === root || target.startsWith(`${root}/`);
  });
}

// fileKey(p: string) -> string: a path as a map key ("/" separators, lower case).
const fileKey = (p) => norm(p, true);

// A diagnostic's identity without its position (an edit above it moves its line).
const diagKey = (d) => `${d.severity}|${d.source || ''}|${d.code || ''}|${d.message}`;

// newDiagnostics(baseline: Diag[], now: Diag[]) -> Diag[]
// Diag = {severity: 'error'|'warning', line (1-based), column (1-based), message, source?, code?}.
// The entries of `now` not in `baseline`, counted as a multiset (two equal errors before, three now:
// one is new). Only errors and warnings.
function newDiagnostics(baseline, now) {
  const left = new Map();
  for (const d of baseline || []) left.set(diagKey(d), (left.get(diagKey(d)) || 0) + 1);
  const out = [];
  for (const d of now || []) {
    if (d.severity !== 'error' && d.severity !== 'warning') continue;
    const k = diagKey(d);
    const n = left.get(k) || 0;
    if (n > 0) left.set(k, n - 1);
    else out.push(d);
  }
  return out;
}

function itemLine(d) {
  let msg = String(d.message || '').replace(/\s+/g, ' ').trim();
  if (msg.length > MESSAGE_MAX) msg = `${msg.slice(0, MESSAGE_MAX)}...`;
  const tag = [d.source, d.code].filter((x) => x !== undefined && x !== null && x !== '').join(' ');
  return `- ${d.severity} at line ${d.line}:${d.column}: ${msg}${tag ? ` [${tag}]` : ''}`;
}

// buildBlock(entries: Array<{path, items: Diag[]}>) -> string | null
// The English block, or null when there is nothing new. At most MAX_ITEMS items and about MAX_CHARS
// characters of items; the rest is counted in "N more not shown".
function buildBlock(entries) {
  const files = (entries || []).filter((e) => e && e.items && e.items.length);
  if (!files.length) return null;
  const total = files.reduce((n, e) => n + e.items.length, 0);
  const lines = ['After your last edits, the IDE reports these new errors and warnings in the edited files:'];
  let shown = 0;
  let chars = 0;
  let full = false;
  for (const e of files) {
    if (full) break;
    const head = String(e.path).replace(/\\/g, '/');
    let headDone = false;
    for (const d of e.items) {
      const line = itemLine(d);
      if (shown >= MAX_ITEMS || (shown > 0 && chars + line.length > MAX_CHARS)) { full = true; break; }
      if (!headDone) { lines.push(head); headDone = true; }
      lines.push(line);
      shown += 1;
      chars += line.length;
    }
  }
  if (total > shown) lines.push(`(${total - shown} more not shown)`);
  return `<ide_diagnostics>${lines.join('\n')}\n</ide_diagnostics>`;
}

// createTracker(source) -> tracker
// source: {read(path) -> Diag[] | null (null: outside the workspace or unavailable),
//          waitForChange(path, ms) -> Promise<void> (resolves on a change for that file or after ms)}
// or null (the tracker does nothing).
function createTracker(source) {
  const pending = new Map(); // tool_use id -> {path, baseline}
  const edited = new Map(); // fileKey -> {path, baseline}
  const settling = new Set(); // promises still waiting for the language server

  // observe(events: UI events) -> void: the stream's translated events (event-translator.js).
  function observe(events) {
    if (!source) return;
    for (const ev of events || []) {
      if (ev.kind === 'tool' && ev.final && EDIT_TOOLS.has(ev.name) && ev.id && !pending.has(ev.id)) {
        const p = ev.input && ev.input.file_path;
        const baseline = typeof p === 'string' && p ? source.read(p) : null;
        if (baseline) pending.set(ev.id, { path: p, baseline });
      } else if (ev.kind === 'toolResult' && pending.has(ev.toolUseId)) {
        const entry = pending.get(ev.toolUseId);
        pending.delete(ev.toolUseId);
        if (ev.isError) continue; // denied or failed: the file did not change
        const key = fileKey(entry.path);
        if (!edited.has(key)) edited.set(key, entry); // the earliest baseline wins
        const wait = Promise.resolve(source.waitForChange(entry.path, SETTLE_MS)).catch(() => {});
        settling.add(wait);
        wait.then(() => settling.delete(wait));
      }
    }
  }

  // whenSettled() -> Promise<void> | null: null when no edited file still waits for the language
  // server, so a send without fresh edits stays synchronous.
  function whenSettled() {
    if (!edited.size || !settling.size) return null;
    return Promise.all([...settling]).then(() => {});
  }

  // takeBlock() -> string | null: the block for the edited files, once; forgets them.
  function takeBlock() {
    if (!source || !edited.size) return null;
    const entries = [...edited.values()].map((e) => ({ path: e.path, items: newDiagnostics(e.baseline, source.read(e.path) || []) }));
    reset();
    return buildBlock(entries);
  }

  // reset() -> void: forgets every baseline and edited file (after /clear).
  function reset() {
    pending.clear();
    edited.clear();
    settling.clear();
  }

  return { observe, whenSettled, takeBlock, reset, hasPending: () => edited.size > 0 };
}

module.exports = {
  createTracker, newDiagnostics, buildBlock, insideFolders, EDIT_TOOLS, MAX_ITEMS, MAX_CHARS, SETTLE_MS,
};
