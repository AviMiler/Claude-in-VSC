// The file chip and the lines chip above the box (package K, PLAN.md section 10). The host decides
// what they show (src/tagging/file-chip.js); this draws them and sends the user's actions back.
// File chip: automatic (the open file) or a manual choice; a click opens a menu (automatic, "בחר
// קובץ...", the recent choices). Lines chip: automatic only. Both stay visible, empty with a grey hint.
(function () {
  const { el, post } = CL;
  const box = document.getElementById('editor-chips');

  // Static icons drawn like VS Code's file / folder codicons (no icon font is bundled).
  const ICONS = {
    file: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5l3 3v10H4z M9 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>',
    folder: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>',
    lines: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>',
  };

  let state = { file: null, lines: null, reverted: false, recents: [] };

  function icon(name) {
    const span = el('span', { class: 'editor-chip-icon' });
    span.innerHTML = ICONS[name]; // static markup above, never data
    return span;
  }

  function removeBtn(label, action) {
    return el('button', {
      type: 'button', text: '✕', title: 'הסרה', 'aria-label': `הסרת ${label}`,
      onclick: (e) => { e.stopPropagation(); post({ type: 'fileChip', action }); },
    });
  }

  function fileTitle(f) {
    if (!f) return 'אין קובץ פתוח. לחיצה לבחירת קובץ או תיקייה';
    const how = f.manual ? 'נבחר ידנית, חוזר לאוטומטי אחרי השליחה' : 'אוטומטי: הקובץ הפתוח בעורך';
    return `${f.path}\n${how}${f.outside ? '\nמחוץ לפרויקט' : ''}\nClaude יקבל את הנתיב עם ההודעה הבאה (פעם אחת לכל שינוי). לחיצה לבחירה`;
  }

  function fileChip() {
    const f = state.file;
    // A span with role="button": the chip holds its own ✕ button, and buttons cannot nest.
    const chip = el('span', {
      role: 'button',
      tabindex: '0',
      class: `editor-chip file-chip${f ? '' : ' chip-empty'}${f && f.manual ? ' manual' : ''}${state.reverted ? ' reverted' : ''}`,
      dir: 'auto',
      title: fileTitle(f),
      'aria-haspopup': 'menu',
      onclick: () => openMenu(chip),
      onkeydown: (e) => {
        if (e.target === chip && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openMenu(chip); }
      },
    },
    icon(f && f.isDir ? 'folder' : 'file'),
    el('span', { class: 'editor-chip-label', text: f ? f.name : 'אין קובץ' }),
    state.reverted ? el('span', { class: 'chip-reverted', text: 'הוחזר למצב אוטומטי' }) : null,
    f ? removeBtn(f.name, 'remove') : null);
    return chip;
  }

  function linesChip() {
    const l = state.lines;
    if (!l) return el('span', { class: 'editor-chip chip-empty', title: 'אין בחירה בקובץ שבתגית הקובץ' }, icon('lines'), el('span', { class: 'editor-chip-label', text: 'אין בחירה' }));
    const range = l.start === l.end ? `שורה ${l.start}` : `שורות ${l.start}–${l.end}`;
    return el('span', { class: 'editor-chip', dir: 'auto', title: `${range} ב-${l.name}\nהשורות שנבחרו יישלחו עם ההודעה הבאה` },
      icon('lines'), el('span', { class: 'editor-chip-label', text: range }), removeBtn(range, 'removeLines'));
  }

  function openMenu(anchor) {
    CL.fileChips.ack(); // a click ends the "back to automatic" mark
    const f = state.file;
    const manualKey = f && f.manual ? f.path.toLowerCase() : null;
    const items = [
      { value: 'auto', icon: '⟳', label: 'אוטומטי', desc: 'הקובץ הפתוח בעורך', checked: !manualKey },
      { value: 'pick', icon: '…', label: 'בחר קובץ...', desc: 'קובץ או תיקייה, בחלון הבחירה של VS Code' },
      ...state.recents.map((r, i) => ({
        value: `recent:${i}`,
        icon: r.isDir ? '📁' : '📄',
        label: r.path.split('/').filter(Boolean).pop(),
        desc: r.path,
        checked: manualKey === r.path.toLowerCase(),
      })),
    ];
    CL.menu.open(anchor, items, (value) => {
      if (value.startsWith('recent:')) post({ type: 'fileChip', action: 'recent', path: state.recents[Number(value.slice(7))].path });
      else post({ type: 'fileChip', action: value });
    });
  }

  CL.fileChips = {
    // m: {file, lines, reverted, recents} from the host.
    render(m) {
      state = { file: m.file || null, lines: m.lines || null, reverted: Boolean(m.reverted), recents: m.recents || [] };
      box.replaceChildren(fileChip(), linesChip());
      box.hidden = false;
    },
    // Typing ends the "back to automatic" mark.
    ack() {
      if (!state.reverted) return;
      state.reverted = false;
      post({ type: 'fileChip', action: 'ack' });
    },
  };
})();
