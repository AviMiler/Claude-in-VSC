// MCP management dialog: server list with status, enable/disable, reconnect, remove, and an
// add form. The host does the work (control requests / `claude mcp add|remove`); this only renders.
(function () {
  const { el, post } = CL;

  const root = document.getElementById('mcp-dialog');
  const STATUS_CLASS = { connected: 'ok', failed: 'bad', 'needs-auth': 'bad', pending: 'wait', disabled: 'off' };
  let state = { servers: [], error: '' };
  let result = null;
  let adding = false;
  let confirmRemove = '';
  let pollTimer = 0;

  const send = (action, extra) => post({ type: 'mcp', action, ...extra });

  function button(text, onclick, cls = '') {
    return el('button', { class: `mcp-btn ${cls}`, type: 'button', text, onclick });
  }

  function serverRow(s) {
    const removeBtn = confirmRemove === s.name
      ? button('אישור הסרה', () => { confirmRemove = ''; send('remove', { name: s.name, scope: s.scope }); }, 'danger')
      : button('הסרה', () => { confirmRemove = s.name; render(); });
    return el('div', { class: 'mcp-row' },
      el('div', { class: 'mcp-main' },
        el('span', { class: 'mcp-name', dir: 'ltr', text: s.name }),
        el('span', { class: `mcp-status ${STATUS_CLASS[s.status] || ''}`, text: s.statusText }),
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
    return el('div', { class: 'mcp-form' },
      field('שם', name), field('היקף', scope), field('סוג', transport), field('פקודה או כתובת', target), field('משתני סביבה', env),
      el('div', { class: 'mcp-actions' }, button('הוספה', submit, 'primary'), button('ביטול', () => { adding = false; render(); })));
  }

  function render() {
    const body = [
      el('div', { class: 'mcp-head' },
        el('strong', { text: 'שרתי MCP' }),
        el('span', { class: 'spacer' }),
        button('רענון', () => send('status')),
        button('סגירה', () => hide())),
      state.error ? el('div', { class: 'mcp-error', dir: 'auto', text: state.error }) : null,
      !state.error && !state.servers.length ? el('div', { class: 'history-empty', text: 'לא הוגדרו שרתי MCP.' }) : null,
      ...state.servers.map(serverRow),
      result ? el('div', { class: `mcp-result ${result.ok ? 'ok' : 'bad'}`, dir: 'auto', text: result.text }) : null,
      adding ? addForm() : el('div', { class: 'mcp-actions' }, button('הוספת שרת', () => { adding = true; render(); }, 'primary')),
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
    render();
    send('status');
  }

  function hide() {
    root.hidden = true;
    clearTimeout(pollTimer);
  }

  document.getElementById('mcp-btn').addEventListener('click', () => (root.hidden ? show() : hide()));

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
  };
})();
