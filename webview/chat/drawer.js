// The conversations drawer: slides in from the start side. "Open" lists the conversations of this
// place (the visible one and those running or waiting in the background) with a status dot;
// "Past" lists the CLI's transcripts. Pick = switch; rename goes through the CLI's /rename;
// close stops a conversation. The host owns the list; this only draws it.
(function () {
  const { el, post } = CL;
  const logic = CL.drawerLogic;

  const btn = document.getElementById('drawer-btn');
  const btnDot = document.getElementById('drawer-dot');
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('drawer-backdrop');

  let open = [];
  let past = null; // null while loading
  let filter = 'all';
  let query = '';
  let renaming = null; // row key being renamed
  let confirmClose = null; // conversation id waiting for a second click
  let lastFocus = null;

  const search = el('input', { class: 'drawer-search', type: 'text', dir: 'auto', placeholder: 'חיפוש שיחות…', 'aria-label': 'חיפוש שיחות' });
  const segs = el('div', { class: 'segmented', role: 'tablist', 'aria-label': 'סינון' });
  const list = el('div', { class: 'drawer-list' });

  const icon = (d) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = d;
    return svg;
  };
  const ICONS = {
    pencil: '<path d="M10.5 2.5l3 3-8 8H2.5v-3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    plus: '<path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    search: '<circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.2 10.2L13.5 13.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  };

  const ui = () => CL.composer.uiState();

  function headerRow() {
    return el('div', { class: 'drawer-head' },
      el('span', { class: 'drawer-title', text: 'שיחות' }),
      el('button', { class: 'icon-btn', type: 'button', title: 'שיחה חדשה', 'aria-label': 'שיחה חדשה', onclick: () => { close(); CL.app.newConversation(); } }, icon(ICONS.plus)),
      el('button', { class: 'icon-btn', type: 'button', title: 'סגירה', 'aria-label': 'סגירת הרשימה', onclick: () => close(true) }, icon(ICONS.close)));
  }

  function renderSegs() {
    segs.replaceChildren(...logic.FILTERS.map((f) => el('button', {
      class: `seg${f.id === filter ? ' on' : ''}`,
      type: 'button',
      role: 'tab',
      'aria-selected': f.id === filter ? 'true' : 'false',
      text: f.label,
      onclick: () => { filter = f.id; renderSegs(); renderList(); },
    })));
  }

  function renameInput(key, title, submit) {
    const input = el('input', { class: 'drawer-rename', type: 'text', dir: 'auto', value: title, 'aria-label': 'שם חדש לשיחה' });
    input.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter' && input.value.trim()) { renaming = null; submit(input.value.trim()); renderList(); }
      else if (e.key === 'Escape') { e.stopPropagation(); renaming = null; renderList(); }
    });
    input.addEventListener('blur', () => { if (renaming === key) { renaming = null; renderList(); } });
    setTimeout(() => { input.focus(); input.select(); }, 0);
    return input;
  }

  function action(name, label, onclick, extra = '') {
    return el('button', { class: `row-action ${extra}`, type: 'button', title: label, 'aria-label': label, onclick: (e) => { e.stopPropagation(); onclick(); } }, icon(ICONS[name]));
  }

  function openRow(r) {
    const key = `o:${r.id}`;
    const status = logic.STATUS_TEXT[r.status];
    const pick = () => { close(); if (!r.current) post({ type: 'switchConversation', id: r.id, ui: ui() }); };
    const closing = confirmClose === r.id;
    const actions = el('span', { class: 'row-actions' },
      r.sessionId && r.status !== 'running' && r.status !== 'waiting'
        ? action('pencil', 'שינוי שם', () => { renaming = key; renderList(); }) : null,
      closing
        ? el('button', { class: 'row-confirm', type: 'button', text: 'לסגור?', title: 'סגירת השיחה ועצירת Claude בה', onclick: (e) => { e.stopPropagation(); confirmClose = null; post({ type: 'closeConversation', id: r.id }); } })
        : action('close', 'סגירת השיחה', () => {
          if (r.status === 'running' || r.status === 'waiting') { confirmClose = r.id; renderList(); }
          else post({ type: 'closeConversation', id: r.id });
        }));
    return el('div', { class: `drawer-row${r.current ? ' current' : ''}`, role: 'button', tabindex: '0', title: r.title, onclick: pick, onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) pick(); } },
      el('span', { class: `status-dot s-${r.status}`, 'aria-hidden': 'true' }),
      renaming === key
        ? renameInput(key, r.title, (title) => post({ type: 'renameConversation', id: r.id, title }))
        : el('span', { class: 'row-title', dir: 'auto', text: r.title }),
      status && renaming !== key ? el('span', { class: `row-meta s-${r.status}`, text: status }) : null,
      renaming === key ? null : actions);
  }

  function pastRow(p, now) {
    const key = `p:${p.id}`;
    const pick = () => { close(); post({ type: 'openSession', id: p.id, ui: ui() }); };
    return el('div', { class: 'drawer-row', role: 'button', tabindex: '0', title: p.title, onclick: pick, onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) pick(); } },
      renaming === key
        ? renameInput(key, p.title, (title) => { close(); post({ type: 'renameConversation', sessionId: p.id, title }); })
        : el('span', { class: 'row-title', dir: 'auto', text: p.title }),
      renaming === key ? null : el('span', { class: 'row-meta', text: logic.shortTime(p.mtime, now) }),
      renaming === key ? null : el('span', { class: 'row-actions' }, action('pencil', 'שינוי שם', () => { renaming = key; renderList(); })));
  }

  function renderList() {
    if (drawer.hidden) return;
    const now = Date.now();
    const rows = logic.filterRows(open, past || [], filter, query);
    const out = [];
    if (rows.open.length) {
      out.push(el('div', { class: 'drawer-group', text: 'פתוחות' }), ...rows.open.map(openRow));
    }
    if (past === null) out.push(el('div', { class: 'drawer-empty', text: 'טוען…' }));
    else {
      for (const g of logic.groupPast(rows.past, now)) {
        out.push(el('div', { class: 'drawer-group', text: g.label }), ...g.items.map((p) => pastRow(p, now)));
      }
      if (!rows.open.length && !rows.past.length) out.push(el('div', { class: 'drawer-empty', text: query || filter !== 'all' ? 'לא נמצאו שיחות' : 'אין שיחות קודמות בתיקייה הזו' }));
    }
    list.replaceChildren(...out);
  }

  function show() {
    lastFocus = document.activeElement;
    past = null;
    renaming = null;
    confirmClose = null;
    query = '';
    search.value = '';
    renderSegs();
    drawer.replaceChildren(headerRow(), el('div', { class: 'drawer-search-wrap' }, icon(ICONS.search), search), segs, list);
    drawer.hidden = false;
    backdrop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => drawer.classList.add('open'));
    renderList();
    search.focus();
    post({ type: 'listConversations' });
  }

  function close(restoreFocus) {
    if (drawer.hidden) return;
    drawer.classList.remove('open');
    drawer.hidden = true;
    backdrop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (restoreFocus && lastFocus && lastFocus.focus) lastFocus.focus();
  }

  search.addEventListener('input', () => { query = search.value; renderList(); });
  drawer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !renaming) { e.preventDefault(); close(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...list.querySelectorAll('.drawer-row')];
    if (!rows.length) return;
    e.preventDefault();
    const at = rows.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % rows.length : (at <= 0 ? rows.length - 1 : at - 1);
    rows[next].focus();
  });
  backdrop.addEventListener('mousedown', () => close(true));
  btn.addEventListener('click', () => (drawer.hidden ? show() : close(true)));

  CL.drawer = {
    // The full list (answer to listConversations).
    setList(m) {
      open = m.open || [];
      past = m.past || [];
      renderList();
    },
    // Status changes of the open conversations (sent by the host whenever one changes).
    setStates(m) {
      open = m.open || [];
      const dot = logic.attentionDot(m.attention);
      btnDot.hidden = !dot;
      btnDot.className = `btn-dot${dot ? ` s-${dot}` : ''}`;
      btn.title = dot === 'waiting' ? 'רשימת השיחות – שיחה ממתינה לאישור' : dot === 'unread' ? 'רשימת השיחות – שיחה הסתיימה ברקע' : 'רשימת השיחות';
      if (!renaming) renderList(); // a redraw would reset the rename box while typing
    },
    close,
  };
})();
