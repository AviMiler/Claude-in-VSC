// MCP management dialog: server list with status, enable/disable, reconnect, remove, and an
// add form. The host does the work (control requests / `claude mcp add|remove`); this only renders.
(function () {
  const { el, post } = CL;

  const root = document.getElementById('mcp-dialog');
  const opener = document.getElementById('mcp-btn');
  const STATUS_CLASS = { connected: 'ok', failed: 'bad', 'needs-auth': 'bad', pending: 'wait', disabled: 'off' };
  let state = { servers: [], error: '' };
  let result = null;
  let adding = false;
  let confirmRemove = '';
  let pollTimer = 0;
  let cleanup = null;

  const send = (action, extra) => post({ type: 'mcp', action, ...extra });

  function button(text, onclick, cls = '') {
    return el('button', { class: `mcp-btn ${cls}`, type: 'button', text, onclick });
  }

  function iconButton(label, path, onclick) {
    const b = el('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick });
    b.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${path}</svg>`;
    return b;
  }

  function serverRow(s) {
    const cls = STATUS_CLASS[s.status] || '';
    const removeBtn = confirmRemove === s.name
      ? button('אישור הסרה', () => { confirmRemove = ''; send('remove', { name: s.name, scope: s.scope }); }, 'danger')
      : button('הסרה', () => { confirmRemove = s.name; render(); });
    return el('div', { class: 'mcp-row' },
      el('div', { class: 'mcp-main' },
        el('span', { class: `mcp-dot ${cls}`, 'aria-hidden': 'true' }),
        el('span', { class: 'mcp-name', dir: 'ltr', text: s.name }),
        el('span', { class: `mcp-status ${cls}`, text: s.statusText }),
        s.toolCount ? el('span', { class: 'mcp-tools', text: `${s.toolCount} כלים` }) : null),
      s.error ? el('div', { class: 'mcp-error', dir: 'auto', text: s.error }) : null,
      el('div', { class: 'mcp-actions' },
        button(s.enabled ? 'השבתה' : 'הפעלה', () => send('toggle', { name: s.name, enabled: !s.enabled })),
        button('חיבור מחדש', () => send('reconnect', { name: s.name })),
        removeBtn));
  }

  function field(label, control) {
    return el('label', { class: 'mcp-field' }, el('span', { text: label }), control);
  }

  function addForm() {
    const name = el('input', { class: 'card-input', type: 'text', dir: 'ltr', placeholder: 'my-server' });
    const scope = el('select', { class: 'card-input' },
      el('option', { value: 'local', text: 'מקומי (הפרויקט הזה, פרטי)' }),
      el('option', { value: 'user', text: 'משתמש (כל הפרויקטים)' }),
      el('option', { value: 'project', text: 'פרויקט (משותף, .mcp.json)' }));
    const transport = el('select', { class: 'card-input' },
      el('option', { value: 'stdio', text: 'stdio — פקודה מקומית' }),
      el('option', { value: 'http', text: 'http' }),
      el('option', { value: 'sse', text: 'sse' }));
    const target = el('input', { class: 'card-input', type: 'text', dir: 'ltr', placeholder: 'npx -y @scope/server  /  https://host/mcp' });
    const env = el('textarea', { class: 'card-input', rows: '2', dir: 'ltr', placeholder: 'KEY=VALUE (שורה לכל משתנה)' });
    const submit = () => {
      send('add', { form: { name: name.value, scope: scope.value, transport: transport.value, target: target.value, env: env.value } });
      adding = false;
    };
    setTimeout(() => name.focus(), 0);
    return el('div', { class: 'mcp-form' },
      el('div', { class: 'mcp-form-grid' }, field('שם', name), field('היקף', scope)),
      field('סוג', transport), field('פקודה או כתובת', target), field('משתני סביבה', env),
      el('div', { class: 'mcp-actions' }, button('הוספה', submit, 'primary'), button('ביטול', () => { adding = false; render(); })));
  }

  function render() {
    const body = [
      el('div', { class: 'mcp-head' },
        el('span', { class: 'mcp-title', text: 'שרתי MCP' }),
        el('span', { class: 'spacer' }),
        iconButton('רענון', '<path d="M13 8a5 5 0 1 1-1.5-3.55M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', () => send('status')),
        iconButton('סגירה', '<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>', () => hide(true))),
      el('div', { class: 'mcp-body' },
        state.error ? el('div', { class: 'mcp-error', dir: 'auto', text: state.error }) : null,
        !state.error && !state.servers.length ? el('div', { class: 'mcp-empty', text: 'לא הוגדרו שרתי MCP.' }) : null,
        ...state.servers.map(serverRow),
        result ? el('div', { class: `mcp-result ${result.ok ? 'ok' : 'bad'}`, dir: 'auto', text: result.text }) : null,
        adding ? addForm() : el('div', { class: 'mcp-actions mcp-add' }, button('+ הוספת שרת', () => { adding = true; render(); }, 'primary'))),
    ];
    root.replaceChildren(...body.filter(Boolean));
  }

  // Servers start as "pending" and connect after a few seconds; refresh until none is pending.
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (root.hidden || !state.servers.some((s) => s.status === 'pending')) return;
    pollTimer = setTimeout(() => send('status'), 3000);
  }

  function show() {
    root.hidden = false;
    result = null;
    adding = false;
    render();
    send('status');
    cleanup = CL.onOutsideClick(root, opener, () => hide(false));
  }

  function hide(restoreFocus) {
    if (root.hidden) return;
    root.hidden = true;
    clearTimeout(pollTimer);
    if (cleanup) cleanup();
    cleanup = null;
    if (restoreFocus) opener.focus();
  }

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hide(true);
    }
  });
  opener.addEventListener('click', () => (root.hidden ? show() : hide(false)));

  CL.mcp = {
    setState(m) {
      state = { servers: m.servers || [], error: m.error || '' };
      if (!root.hidden) render();
      schedulePoll();
    },
    setResult(m) {
      result = { ok: m.ok, text: m.text };
      if (!root.hidden) render();
    },
    close: () => hide(false),
  };
})();
