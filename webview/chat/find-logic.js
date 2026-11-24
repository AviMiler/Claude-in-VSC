// Pure logic of the search box inside the open conversation: where a word occurs in a text.
// Loaded as a plain script in the webview (CL.findLogic) and required by the node tests.
(function (root) {
  // Offsets of every non-overlapping, case-insensitive occurrence of `query` in `text`.
  function findOffsets(text, query) {
    const q = String(query || '').toLowerCase();
    const out = [];
    if (!q) return out;
    const hay = String(text || '').toLowerCase();
    let from = 0;
    for (;;) {
      const at = hay.indexOf(q, from);
      if (at < 0) return out;
      out.push(at);
      from = at + q.length;
    }
  }

  // The next/previous match index, wrapping around; -1 when there are no matches.
  function step(current, count, delta) {
    if (!count) return -1;
    return (((current + delta) % count) + count) % count;
  }

  const api = { findOffsets, step };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CL = root.CL || {}).findLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
