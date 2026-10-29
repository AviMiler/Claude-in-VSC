// "Past conversations": the list comes from the CLI's transcript files (read by the host);
// picking one asks the host to resume it.
(function () {
  const { el, post, relTime, onOutsideClick } = CL;

  const btn = document.getElementById('history-btn');
  const panel = document.getElementById('history-panel');

  let items = null;
  let currentId = null;
  let cleanup = null;
  let sel = 0;
  let rows = [];

  function groupOf(mtime) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const day = 24 * 60 * 60 * 1000;
    if (mtime >= startOfToday.getTime()) return 'היום';
    if (mtime >= startOfToday.getTime() - day) return 'אתמול';
    if (mtime >= startOfToday.getTime() - 7 * day) return 'השבוע';
    return 'קודם';
  }

  function mark(idx) {
    sel = idx;
    rows.forEach((r, i) => r.classList.toggle('sel', i === sel));
    if (rows[sel]) rows[sel].scrollIntoView({ block: 'nearest' });
  }

  function pick(id) {
    close();
    if (id !== currentId) post({ type: 'openSession', id });
  }

  function renderList(listEl, query) {
    const q = query.trim().toLowerCase();
    const filtered = (items || []).filter((i) => !q || i.title.toLowerCase().includes(q));
    listEl.replaceChildren();
    rows = [];
    if (items === null) {
      listEl.append(el('div', { class: 'history-empty', text: 'טוען…' }));
      return;
    }
    if (!filtered.length) {
      listEl.append(el('div', { class: 'history-empty', text: q ? 'לא נמצאו שיחות' : 'אין שיחות קודמות בתיקייה הזו' }));
      return;
    }
    let group = null;
    for (const item of filtered) {
      const g = groupOf(item.mtime);
      if (g !== group) {
        group = g;
        listEl.append(el('div', { class: 'history-group', text: g }));
      }
      const idx = rows.length;
      const row = el('button', {
        class: `history-row${item.id === currentId ? ' current' : ''}`,
        type: 'button',
        title: item.title,
        onclick: () => pick(item.id),
        onmouseenter: () => mark(idx),
      },
      el('span', { class: 'history-row-title', dir: 'auto', text: item.title }),
      el('span', { class: 'history-row-time', text: relTime(item.mtime) }));
      rows.push(row);
      listEl.append(row);
    }
    mark(0);
  }

  function openPanel() {
    items = null;
    const search = el('input', { class: 'history-search', type: 'text', dir: 'auto', placeholder: 'חיפוש שיחות…' });
    const listEl = el('div', { class: 'history-list' });
    panel.replaceChildren(search, listEl);
    panel.hidden = false;
    renderList(listEl, '');
    search.addEventListener('input', () => renderList(listEl, search.value));
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (rows.length) mark((sel + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length);
      } else if (e.key === 'Enter' && rows[sel]) {
        rows[sel].click();
      } else if (e.key === 'Escape') {
        close();
        btn.focus();
      }
    });
    search.focus();
    cleanup = onOutsideClick(panel, btn, close);
    post({ type: 'listHistory' });
  }

  function close() {
    panel.hidden = true;
    panel.replaceChildren();
    if (cleanup) cleanup();
    cleanup = null;
  }

  btn.addEventListener('click', () => (panel.hidden ? openPanel() : close()));

  CL.history = {
    show(list, current) {
      items = list || [];
      currentId = current || currentId;
      const listEl = panel.querySelector('.history-list');
      const search = panel.querySelector('.history-search');
      if (listEl) renderList(listEl, search ? search.value : '');
    },
    setCurrent(id) {
      currentId = id;
    },
    close,
  };
})();
