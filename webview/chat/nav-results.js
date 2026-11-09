// Navigation tool results (mcp__claude-local-nav__*, see src/mcp/nav-tools.js) as a short card under
// the tool row: a Hebrew title and one clickable row per result line that names a location.
// parse() and title() are pure (tested in node); render() builds the card in the webview.
(function (root) {
  const PREFIX = 'mcp__claude-local-nav__';
  const MAX_ROWS = 50;

  // "path:12: src" (references), "path:12 src" (definition, importers): the path has no spaces.
  const PATH_FIRST = /^((?:[A-Za-z]:[\\/])?[^\s:]+):(\d+)(?=$|[:\s]):?\s?(.*)$/;
  // "kind name path:12" (workspace symbols), "name path:12" (call hierarchy).
  const SYMBOL = /^(.+?)\s+((?:[A-Za-z]:[\\/])?[^\s:]+):(\d+)$/;
  // "kind name lines 3-9" (document symbols): the file is the tool's input file.
  const OUTLINE = /^(.+?)\s+lines\s+(\d+)-(\d+)$/;
  const MORE = /^(\d+) more not shown$/;

  // text: the tool result; file: the tool's input file (for outline lines).
  // -> { items: [{ path, line, label, code }], more } where `more` counts lines the tool left out.
  function parse(text, file) {
    const items = [];
    let more = 0;
    for (const raw of String(text || '').split('\n')) {
      const s = raw.trim();
      if (!s) continue;
      let m = MORE.exec(s);
      if (m) { more += Number(m[1]); continue; }
      m = PATH_FIRST.exec(s);
      if (m) { items.push({ path: m[1], line: Number(m[2]), label: m[3].trim(), code: true }); continue; }
      m = SYMBOL.exec(s);
      if (m) { items.push({ path: m[2], line: Number(m[3]), label: m[1], code: false }); continue; }
      m = OUTLINE.exec(s);
      if (m && file) items.push({ path: String(file), line: Number(m[2]), label: m[1], code: false, end: Number(m[3]) });
    }
    return { items, more };
  }

  // -> { text, name } : the Hebrew title and the symbol/file it is about (shown left-to-right).
  function title(tool, input) {
    const i = input || {};
    const sym = String(i.symbol || '');
    const file = String(i.file || '');
    switch (tool) {
      case 'findReferences': return { text: 'הפניות ל-', name: sym };
      case 'goToDefinition': return { text: 'הגדרה של ', name: sym };
      case 'documentSymbols': return { text: 'סמלים בקובץ ', name: file };
      case 'findImporters': return { text: 'קבצים שמייבאים את ', name: file };
      case 'workspaceSymbols': return { text: 'סמלים בפרויקט: ', name: String(i.query || '') };
      case 'callHierarchy':
        return i.direction === 'outgoing' ? { text: 'קריאות מתוך ', name: sym } : { text: 'מי קורא ל-', name: sym };
      default: return { text: 'תוצאות ניווט', name: '' };
    }
  }

  // readSymbol and hover return source code and docs, never locations: a "name:12" in that text is
  // not a place to open, so they get no card (their row's open button covers the file).
  const NO_LOCATIONS = ['readSymbol', 'hover'];

  // The navigation tool name ("findReferences"), or '' when `name` is not a navigation tool with locations.
  function toolOf(name) {
    const s = String(name || '');
    const tool = s.startsWith(PREFIX) ? s.slice(PREFIX.length) : '';
    return NO_LOCATIONS.includes(tool) ? '' : tool;
  }

  // The card for a navigation tool result, or null (another tool, or no line names a location).
  function render(name, input, text) {
    const tool = toolOf(name);
    if (!tool) return null;
    const { items, more } = parse(text, input && input.file);
    if (!items.length) return null;
    const { el, post } = root.CL;
    const t = title(tool, input);
    const rows = items.slice(0, MAX_ROWS).map((it) => {
      const loc = el('bdi', { class: 'nav-loc', dir: 'ltr', text: `${it.path}:${it.line}${it.end ? `-${it.end}` : ''}` });
      const label = it.label ? el(it.code ? 'bdi' : 'span', { class: `nav-label${it.code ? ' code' : ''}`, dir: it.code ? 'ltr' : 'auto', text: it.label }) : null;
      return el('button', {
        class: 'nav-row', type: 'button', title: 'פתיחה בעורך',
        onclick: () => post({ type: 'openFile', path: it.path, line: it.line }),
      }, it.code ? [loc, label] : [label, loc]);
    });
    const hidden = more + Math.max(0, items.length - MAX_ROWS);
    return el('div', { class: 'nav-card' },
      el('div', { class: 'nav-title' }, t.text, t.name ? el('bdi', { dir: 'ltr', text: t.name }) : null),
      el('div', { class: 'nav-rows' }, rows),
      hidden ? el('div', { class: 'nav-more', text: `ועוד ${hidden} שלא מוצגים` }) : null);
  }

  const api = { PREFIX, MAX_ROWS, parse, title, toolOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CL = root.CL || {}).navResults = { ...api, render };
})(typeof window !== 'undefined' ? window : globalThis);
