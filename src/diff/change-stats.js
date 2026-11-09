// Pure: added / removed line counts per changed file, from the session's edit log (edit-log.js).
// Each fragment is diffed on its own (old_string -> new_string) with a line LCS. A `Write` is
// compared with the file's last known content in this session (an earlier Write with the later
// Edits applied), or counted as all added when nothing earlier is known. No disk reads.

// Past this many cells (lines before x lines after, after trimming the common ends) the LCS is
// skipped and every differing line counts as removed and added: it keeps a huge Write from
// blocking the extension host.
const MAX_CELLS = 2000 * 2000;

function splitLines(text) {
  if (!text) return [];
  const lines = String(text).split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop(); // a final newline ends the last line
  return lines;
}

// Length of the longest common subsequence, two rows of memory.
function lcsLength(a, b) {
  let prev = new Uint32Array(b.length + 1);
  let row = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    [prev, row] = [row, prev];
  }
  return prev[b.length];
}

// { added, removed } between two texts, by lines.
function lineDiffCounts(before, after) {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (!midA.length || !midB.length) return { added: midB.length, removed: midA.length };
  const common = midA.length * midB.length > MAX_CELLS ? 0 : lcsLength(midA, midB);
  return { added: midB.length - common, removed: midA.length - common };
}

// Fragment object -> { from, added, removed }. The edit log keeps its fragment objects for its
// whole life, so each one is diffed once however often the card is rebuilt; a replaced log's
// fragments drop out with it. `from` is the text the counts were taken against: a Write's
// depends on the earlier entries, so a cached count is reused only while that text is the same.
const sharedCache = new WeakMap();

function cachedCounts(cache, diff, fragment, from) {
  const hit = cache.get(fragment);
  if (hit && hit.from === from) return hit;
  const { added, removed } = diff(from, fragment.after);
  const counts = { from, added, removed };
  cache.set(fragment, counts);
  return counts;
}

// Changed files in first-change order: [{ path, added, removed }].
// `cache` and `diff` are injectable for tests; the defaults are the shared cache and lineDiffCounts.
function fileStats(log, { cache = sharedCache, diff = lineDiffCounts } = {}) {
  const files = new Map(); // path -> { path, added, removed }
  const known = new Map(); // path -> content known from a Write (and the Edits after it)
  for (const entry of log.byId.values()) {
    const { path } = entry;
    if (!files.has(path)) files.set(path, { path, added: 0, removed: 0 });
    const sum = files.get(path);
    for (const fragment of entry.fragments) {
      const { before, after } = fragment;
      const from = entry.write ? (known.get(path) || '') : before;
      const { added, removed } = cachedCounts(cache, diff, fragment, from);
      sum.added += added;
      sum.removed += removed;
      if (entry.write) known.set(path, after);
      else if (known.has(path) && before && known.get(path).includes(before)) {
        known.set(path, known.get(path).replace(before, () => after));
      }
    }
  }
  return [...files.values()];
}

module.exports = { fileStats, lineDiffCounts, splitLines, MAX_CELLS };
