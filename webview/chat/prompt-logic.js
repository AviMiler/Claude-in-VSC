// Pure logic of the prompt box: the grouped "/" menu, the visible message queue and the per-conversation
// prompt history. Loaded as a plain script in the webview (CL.prompt) and required by the node tests.
(function (root) {
  // Names the CLI cannot run in stream-json mode (PLAN.md stage 8); used until `system/init` reports
  // its own `terminal_slash_commands`.
  const DEFAULT_TERMINAL_ONLY = ['doctor', 'color'];

  const GROUPS = [
    { id: 'local', label: 'פקודות של התוסף' },
    { id: 'builtin', label: 'פקודות' },
    { id: 'skill', label: 'סקילים' },
    { id: 'terminal', label: 'בטרמינל בלבד' },
  ];

  // meta: {skills?: string[], terminalOnly?: string[]}. Returns the commands tagged with a group id.
  function classify(commands, meta = {}) {
    const skills = new Set((meta.skills || []).map((s) => String(s).toLowerCase()));
    const terminal = new Set((meta.terminalOnly || DEFAULT_TERMINAL_ONLY).map((s) => String(s).toLowerCase()));
    return (commands || []).map((c) => {
      const key = String(c.name).toLowerCase();
      const group = terminal.has(key) ? 'terminal' : skills.has(key) ? 'skill' : 'builtin';
      return { ...c, group };
    });
  }

  // Filters by the text after "/" (prefix matches first) and returns items ordered by group, then
  // name, capped at `max`. Group order is the order of GROUPS (terminal-only last).
  function filterCommands(tagged, query, max = 50) {
    const q = String(query || '').toLowerCase();
    const starts = tagged.filter((c) => c.name.toLowerCase().startsWith(q));
    const contains = tagged.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
    const rank = (c) => GROUPS.findIndex((g) => g.id === c.group);
    const byGroup = (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name);
    return starts.sort(byGroup).concat(contains.sort(byGroup)).slice(0, max);
  }

  // "/doctor foo" -> "doctor"; null when the text is not a slash command.
  function commandName(text) {
    const m = /^\/([^\s/]+)/.exec(String(text || '').trim());
    return m ? m[1] : null;
  }

  function isTerminalOnly(text, meta = {}) {
    const name = commandName(text);
    if (!name) return false;
    const list = meta.terminalOnly || DEFAULT_TERMINAL_ONLY;
    return list.some((n) => String(n).toLowerCase() === name.toLowerCase());
  }

  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const MAX_IMAGE_BASE64 = (5 * 1024 * 1024 * 4) / 3; // 5 MB of binary, as base64 characters

  // Images are accepted for every model (PLAN.md stage 2); only type and size are checked.
  function validateImage(mediaType, base64) {
    if (!IMAGE_TYPES.includes(mediaType)) return 'סוג תמונה לא נתמך (PNG, JPEG, GIF או WebP)';
    if (!base64 || base64.length > MAX_IMAGE_BASE64) return 'התמונה גדולה מדי (עד 5MB)';
    return null;
  }

  // Messages typed while a turn runs wait here (in memory) and go out one at a time when it ends.
  function createQueue() {
    let items = [];
    let nextId = 1;
    return {
      push(text, images = []) {
        const item = { id: nextId++, text, images };
        items.push(item);
        return item;
      },
      cancel(id) {
        const before = items.length;
        items = items.filter((i) => i.id !== id);
        return items.length < before;
      },
      shift() {
        return items.shift() || null;
      },
      list: () => items.slice(),
      clear() {
        items = [];
      },
      get size() {
        return items.length;
      },
    };
  }

  // Up/down-arrow history of one conversation. `draft` keeps what was typed before browsing.
  function createHistory(limit = 100) {
    let entries = [];
    let pos = -1;
    let draft = '';
    return {
      add(text) {
        const t = String(text || '');
        if (t.trim() && entries[entries.length - 1] !== t) entries.push(t);
        if (entries.length > limit) entries = entries.slice(-limit);
        pos = -1;
      },
      // Returns the older entry, or null when there is none.
      prev(current) {
        if (!entries.length) return null;
        if (pos === -1) {
          draft = current;
          pos = entries.length;
        }
        if (pos === 0) return null;
        pos -= 1;
        return entries[pos];
      },
      // Returns the newer entry (or the saved draft past the end), or null when not browsing.
      next() {
        if (pos === -1) return null;
        pos += 1;
        if (pos >= entries.length) {
          pos = -1;
          return draft;
        }
        return entries[pos];
      },
      reset(list) {
        entries = (list || []).filter((t) => String(t).trim());
        pos = -1;
        draft = '';
      },
      get browsing() {
        return pos !== -1;
      },
    };
  }

  const api = { GROUPS, DEFAULT_TERMINAL_ONLY, classify, filterCommands, validateImage, IMAGE_TYPES, commandName, isTerminalOnly, createQueue, createHistory };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CL = root.CL || {}).prompt = api;
})(typeof window !== 'undefined' ? window : globalThis);
