// Pure logic for LaTeX math in assistant messages: finds math in Markdown source (never in code)
// and swaps each piece for a placeholder, so marked cannot mangle it. Loaded as a plain script
// in the webview (CL.mathLogic) and required by the node tests. No DOM, no KaTeX in here.
(function (root) {
  const OPEN = '';
  const CLOSE = '';
  const PLACEHOLDER_RE = /(\d+)/g;

  const isSpace = (c) => c === undefined || /\s/.test(c);
  const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';

  // Index just after the closing `close`, or -1. Backslash escapes the next character.
  // Math never crosses a blank line (a stray opener must not swallow a paragraph).
  function findClose(s, from, close) {
    for (let j = from; j < s.length; j++) {
      const c = s[j];
      if (c === '\n' && s[j + 1] === '\n') return -1;
      if (s.startsWith(close, j)) return j;
      if (c === '\\') j++;
    }
    return -1;
  }

  // Finds the math that starts at s[i]; returns { end, src, display, raw } or null.
  function matchAt(s, i) {
    const c = s[i];
    if (c === '$') {
      if (s[i + 1] === '$') {
        const j = findClose(s, i + 2, '$$');
        if (j < 0 || !s.slice(i + 2, j).trim()) return null;
        return { end: j + 2, src: s.slice(i + 2, j), display: true, raw: s.slice(i, j + 2) };
      }
      if (isSpace(s[i + 1])) return null;
      // The closing `$` follows a non-space and is not followed by a digit ("$5 and $10").
      for (let j = i + 1; j < s.length; j++) {
        const d = s[j];
        if (d === '\\') { j++; continue; }
        if (d === '\n' && s[j + 1] === '\n') return null;
        if (d !== '$') continue;
        if (isSpace(s[j - 1]) || isDigit(s[j + 1])) return null;
        return { end: j + 1, src: s.slice(i + 1, j), display: false, raw: s.slice(i, j + 1) };
      }
      return null;
    }
    if (c === '\\' && (s[i + 1] === '(' || s[i + 1] === '[')) {
      const display = s[i + 1] === '[';
      const close = display ? '\\]' : '\\)';
      const j = findClose(s, i + 2, close);
      if (j < 0 || !s.slice(i + 2, j).trim()) return null;
      return { end: j + 2, src: s.slice(i + 2, j), display, raw: s.slice(i, j + 2) };
    }
    return null;
  }

  // One run of text with no fenced code in it: skip inline code spans, escapes, then math.
  function scanChunk(s, items) {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '`') {
        let n = 1;
        while (s[i + n] === '`') n++;
        const fence = '`'.repeat(n);
        let j = i + n;
        let close = -1;
        while (j < s.length) {
          const k = s.indexOf('`', j);
          if (k < 0) break;
          let m = 1;
          while (s[k + m] === '`') m++;
          if (m === n) { close = k; break; }
          j = k + m;
        }
        if (close < 0) { out += s.slice(i, i + n); i += n; continue; }
        out += s.slice(i, close + n);
        i = close + n;
        continue;
      }
      if (c === '\\') {
        const m = (s[i + 1] === '(' || s[i + 1] === '[') ? matchAt(s, i) : null;
        if (m) { out += OPEN + (items.push(m) - 1) + CLOSE; i = m.end; continue; }
        out += s.slice(i, i + 2); // escaped `\$`, `\\` and friends stay as they are
        i += 2;
        continue;
      }
      if (c === '$') {
        const m = matchAt(s, i);
        if (m) { out += OPEN + (items.push(m) - 1) + CLOSE; i = m.end; continue; }
        // A `$$` that did not match stays together, so its second `$` cannot start inline math.
        const len = s[i + 1] === '$' ? 2 : 1;
        out += s.slice(i, i + len);
        i += len;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  // Replaces every math piece outside code with a placeholder.
  // Returns { text, items } where items[i] = { src, display, raw }.
  function extract(input) {
    const items = [];
    const lines = String(input || '').replace(/[]/g, '').split('\n');
    let out = [];
    let chunk = [];
    let fence = null; // { ch, len } while inside a fenced code block
    const flush = () => {
      if (chunk.length) out.push(scanChunk(chunk.join('\n'), items));
      chunk = [];
    };
    for (const line of lines) {
      const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence) {
        out.push(line);
        if (m && m[1][0] === fence.ch && m[1].length >= fence.len && !line.slice(m[0].length).trim()) fence = null;
      } else if (m) {
        flush();
        out.push(line);
        fence = { ch: m[1][0], len: m[1].length };
      } else {
        chunk.push(line);
      }
    }
    flush();
    return { text: out.join('\n'), items };
  }

  // Swaps placeholders in rendered HTML via fn(item, index) -> string.
  function restore(html, items, fn) {
    return String(html).replace(PLACEHOLDER_RE, (all, n) => (items[n] ? fn(items[n], Number(n)) : ''));
  }

  const api = { extract, restore, PLACEHOLDER_RE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CL = root.CL || {}).mathLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
