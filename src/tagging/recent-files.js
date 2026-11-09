// The recent tagging choices (package K): files and folders picked in the file chip, files picked in
// the `@` menu and Alt+K. One list shared by all conversations, in memory only (lost on a window
// reload; nothing is stored). Shown in the chip menu and first in the `@` menu.
const { pathKey, baseName } = require('./chips');
const { toSlashes } = require('../panels/mentions');

const MAX_RECENT = 5;

function createRecentFiles(max = MAX_RECENT) {
  let items = []; // [{path, isDir}], most recent first
  const listeners = new Set();
  return {
    add(path, isDir = false) {
      if (!path) return;
      const clean = toSlashes(String(path)).replace(/(.)\/+$/, '$1');
      const key = pathKey(clean);
      items = [{ path: clean, isDir: Boolean(isDir) }, ...items.filter((i) => pathKey(i.path) !== key)].slice(0, max);
      for (const fn of listeners) fn();
    },
    list: () => items.map((i) => ({ ...i })),
    has: (path) => items.some((i) => pathKey(i.path) === pathKey(path)),
    onDidChange(fn) {
      listeners.add(fn);
      return { dispose: () => listeners.delete(fn) };
    },
  };
}

// Pure: the recent items that match an `@` query, as `@`-menu rows (shown before the ranked list).
// `cwd` makes the shown path relative when the item is inside the project. A query ending in "/"
// is a folder being drilled into: no recent rows then.
function mentionRows(recent, query, cwd) {
  const q = String(query || '').toLowerCase();
  if (q.endsWith('/')) return [];
  const base = cwd ? `${toSlashes(cwd).replace(/\/+$/, '')}/` : null;
  const rows = [];
  for (const item of recent) {
    const shown = base && item.path.toLowerCase().startsWith(base.toLowerCase()) ? item.path.slice(base.length) : item.path;
    if (q && !baseName(item.path).toLowerCase().includes(q) && !shown.toLowerCase().includes(q)) continue;
    rows.push({ path: item.isDir ? `${shown}/` : shown, isDir: item.isDir, abs: item.isDir ? `${item.path}/` : item.path, recent: true });
  }
  return rows;
}

// The `@` menu: recent rows first, then the ranked rows without the ones already shown.
function mergeMentionRows(recentRows, ranked, max = 30) {
  const seen = new Set(recentRows.map((r) => pathKey(r.abs)));
  return recentRows.concat(ranked.filter((r) => !seen.has(pathKey(r.abs)))).slice(0, max);
}

const shared = createRecentFiles();

module.exports = { createRecentFiles, mentionRows, mergeMentionRows, shared, MAX_RECENT };
