// How each CLI tool call is summarized in its row and shown when expanded.
(function () {
  const { el, truncate } = CL;
  const RESULT_MAX = 8000;

  let cwd = '';

  function setCwd(value) {
    cwd = value || '';
  }

  function relPath(p) {
    if (!p) return '';
    const base = cwd.replace(/[\\/]+$/, '');
    if (base && p.toLowerCase().startsWith(base.toLowerCase()) && /[\\/]/.test(p[base.length] || '')) {
      return p.slice(base.length + 1);
    }
    return p;
  }

  function firstLine(s) {
    return String(s || '').split('\n')[0];
  }

  const NAV_PREFIX = 'mcp__claude-local-nav__';

  // The navigation tools (src/mcp/nav-tools.js): "symbol · file", with the file (relative to the
  // workspace, or absolute) and the 1-based line to open.
  function navSummary(tool, i) {
    const line = Number.isInteger(i.line) && i.line > 0 ? i.line : undefined;
    const file = typeof i.file === 'string' ? i.file : '';
    if (tool === 'workspaceSymbols') return { text: [i.query, i.kind].filter(Boolean).join(' · ') };
    const head = tool === 'documentSymbols' ? i.kind : tool === 'callHierarchy' ? [i.symbol, i.direction].filter(Boolean).join(' ') : i.symbol;
    const text = [head, relPath(file)].filter(Boolean).join(' · ');
    return file ? { text, path: file, line } : { text };
  }

  // -> {text, path?, line?}; a path gives the row an "open in editor" button.
  function summary(name, input) {
    const i = input || {};
    switch (name) {
      case 'Bash':
      case 'PowerShell':
        return { text: truncate(firstLine(i.command), 200) };
      case 'Read': {
        const range = i.offset ? `:${i.offset}${i.limit ? `-${i.offset + i.limit}` : ''}` : '';
        return { text: relPath(i.file_path) + range, path: i.file_path, line: i.offset };
      }
      case 'Write':
      case 'Edit':
      case 'MultiEdit':
        return { text: relPath(i.file_path), path: i.file_path };
      case 'NotebookEdit':
        return { text: relPath(i.notebook_path), path: i.notebook_path };
      case 'Glob':
        return { text: i.path ? `${i.pattern} · ${relPath(i.path)}` : i.pattern || '' };
      case 'Grep':
        return { text: [i.pattern, i.glob, i.path && relPath(i.path)].filter(Boolean).join(' · ') };
      case 'WebFetch':
        return { text: i.url || '' };
      case 'WebSearch':
        return { text: i.query || '' };
      case 'Task':
      case 'Agent':
        return { text: [i.subagent_type, i.description].filter(Boolean).join(' · ') };
      case 'TodoWrite':
        return { text: `${(i.todos || []).length} משימות` };
      case 'Skill':
        return { text: i.skill || i.command || '' };
      case 'ExitPlanMode':
        return { text: 'תוכנית' };
      case 'AskUserQuestion':
        return { text: truncate(((i.questions || [])[0] || {}).question || '', 120) };
      default: {
        if (String(name).startsWith(NAV_PREFIX)) return navSummary(name.slice(NAV_PREFIX.length), i);
        const value = Object.values(i).find((v) => typeof v === 'string' && v.length < 300);
        return { text: value ? truncate(firstLine(value), 160) : '' };
      }
    }
  }

  // mcp__server__tool -> "server · tool"
  function displayName(name) {
    const m = /^mcp__(.+?)__(.+)$/.exec(name || '');
    return m ? `${m[1]} · ${m[2]}` : name || '';
  }

  function diffPre(oldText, newText) {
    const pre = el('pre', { class: 'tool-pre' });
    for (const line of String(oldText || '').split('\n')) pre.append(el('span', { class: 'diff-line diff-del', text: `- ${line}` }));
    for (const line of String(newText || '').split('\n')) pre.append(el('span', { class: 'diff-line diff-add', text: `+ ${line}` }));
    return pre;
  }

  function todoList(todos) {
    const icon = { completed: '☑', in_progress: '◐', pending: '☐' };
    return el('ul', { class: 'todo-list' }, (todos || []).map((t) =>
      el('li', { class: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'active' : '', dir: 'auto' },
        el('span', { text: icon[t.status] || '☐' }),
        el('span', { text: t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content })),
    ));
  }

  function section(label, content) {
    return el('div', { class: 'tool-section' }, el('div', { class: 'tool-label', text: label }), content);
  }

  function inputView(name, input) {
    const i = input || {};
    if (name === 'Edit') return diffPre(i.old_string, i.new_string);
    if (name === 'MultiEdit') {
      const wrap = el('div');
      for (const e of i.edits || []) wrap.append(diffPre(e.old_string, e.new_string));
      return wrap;
    }
    if (name === 'Write') return el('pre', { class: 'tool-pre', text: i.content || '' });
    if (name === 'Bash' || name === 'PowerShell') return el('pre', { class: 'tool-pre', text: i.command || '' });
    if (name === 'TodoWrite') return todoList(i.todos);
    return el('pre', { class: 'tool-pre', text: JSON.stringify(i, null, 2) });
  }

  function body(name, input, result) {
    const parts = [section('קלט', inputView(name, input))];
    if (result) {
      const text = result.text.length > RESULT_MAX ? `${result.text.slice(0, RESULT_MAX)}\n…` : result.text;
      parts.push(section(result.isError ? 'שגיאה' : 'תוצאה', el('pre', { class: `tool-pre${result.isError ? ' err' : ''}`, text: text || '(ריק)' })));
    }
    return parts;
  }

  CL.tools = { setCwd, summary, displayName, body, inputView, relPath };
})();
