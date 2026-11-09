// Finds the "/command" or "@file" token being typed at the caret, anywhere in the text.
// Loaded as a plain script in the webview (CL.triggerToken) and required by the node tests.
(function (root) {
  // `@word`, or an open quote `@"C:/my dir/src/`; "@" must follow start / whitespace / opening punctuation (not "a@b.com").
  const MENTION = /(^|[\s(\[{"'])@(?:"([^"]*)|([^\s@"]*))$/;
  const SLASH = /(^|\s)\/(\S*)$/; // "/" must start a word (not "a/b" or "http://")

  // -> {kind, start, end, query, quoted} or null. start = index of the trigger char; end = end of the
  // region a pick replaces (the caret for a mention; the end of the current word for a slash command).
  function find(text, caret) {
    text = String(text);
    const c = caret === undefined ? text.length : caret;
    const before = text.slice(0, c);
    const mm = MENTION.exec(before);
    if (mm) {
      const quoted = mm[2] !== undefined;
      const query = quoted ? mm[2] : mm[3];
      return { kind: 'mention', start: c - query.length - (quoted ? 2 : 1), end: c, query, quoted };
    }
    const sm = SLASH.exec(before);
    if (sm) {
      const rest = /^\S*/.exec(text.slice(c))[0];
      return { kind: 'slash', start: c - sm[2].length - 1, end: c + rest.length, query: sm[2], quoted: false };
    }
    return null;
  }

  const api = { find };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CL = root.CL || {}).triggerToken = api;
})(typeof window !== 'undefined' ? window : globalThis);
