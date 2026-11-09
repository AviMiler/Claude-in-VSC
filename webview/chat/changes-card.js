// The cumulative changes card ("שינויים בשיחה"): one card above the composer listing every file
// Claude changed in this conversation, with added/removed line counts. The host sends the whole
// list each time (`changesCard`, src/diff/changes-card.js); the card is redrawn in place and is
// hidden while the list is empty. A row opens that file's diff (host: `openChangeDiff`).
(function () {
  const { el } = CL;
  const box = el('div', { id: 'changes-card', class: 'changes-card', hidden: true, role: 'region', 'aria-label': 'שינויים בשיחה' });
  const wrap = document.querySelector('.composer-wrap');
  wrap.insertBefore(box, wrap.firstChild);
  let open = true;

  const countText = (n) => (n === 1 ? 'קובץ אחד' : `${n} קבצים`);
  const baseName = (p) => String(p).split(/[\\/]/).pop();
  const dirName = (p) => {
    const parts = String(p).split(/[\\/]/);
    parts.pop();
    return parts.join('/');
  };

  function row(f) {
    const rel = f.rel || f.path;
    const dir = dirName(rel);
    return el('li', {},
      el('button', {
        class: 'changes-file', type: 'button', title: f.path,
        'aria-label': `פתיחת השינויים ב-${rel}: ${f.added} שורות נוספו, ${f.removed} נמחקו`,
        onclick: () => CL.post({ type: 'openChangeDiff', path: f.path }),
      },
      el('span', { class: 'changes-name', text: baseName(rel) }),
      dir ? el('bdi', { class: 'changes-dir', dir: 'ltr', text: dir }) : null,
      el('bdi', { class: 'changes-counts', dir: 'ltr', 'aria-hidden': 'true' },
        el('span', { class: 'changes-add', text: `+${f.added}` }),
        el('span', { class: 'changes-del', text: `−${f.removed}` }))));
  }

  function render(m) {
    const files = m && Array.isArray(m.files) ? m.files : [];
    box.replaceChildren();
    box.hidden = files.length === 0;
    if (!files.length) return;
    const added = files.reduce((s, f) => s + (f.added || 0), 0);
    const removed = files.reduce((s, f) => s + (f.removed || 0), 0);
    box.append(el('details', { open, ontoggle: (e) => { open = e.currentTarget.open; } },
      el('summary', {},
        el('span', { class: 'changes-title', text: `שינויים בשיחה (${countText(files.length)})` }),
        el('bdi', { class: 'changes-counts', dir: 'ltr' },
          el('span', { class: 'changes-add', text: `+${added}` }),
          el('span', { class: 'changes-del', text: `−${removed}` }))),
      el('ul', { class: 'changes-list' }, files.map(row))));
  }

  CL.changesCard = { render };
})();
