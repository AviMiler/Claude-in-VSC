// Search inside the open conversation (Ctrl+F or /find): a small bar over the thread, all matches
// highlighted, Enter / Shift+Enter move between them. Reads the page text only; nothing is stored.
(function () {
  const { el } = CL;
  const logic = CL.findLogic;
  const itemsEl = document.getElementById('items');
  const threadEl = document.getElementById('thread');
  const hasHighlights = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function';

  let ranges = [];
  let index = -1;

  const input = el('input', { class: 'find-input', type: 'text', dir: 'auto', placeholder: 'חיפוש בשיחה…', 'aria-label': 'חיפוש בשיחה' });
  const count = el('span', { class: 'find-count', 'aria-live': 'polite' });
  const prev = el('button', { class: 'find-btn', type: 'button', title: 'הקודם (Shift+Enter)', 'aria-label': 'ההתאמה הקודמת', text: '▲' });
  const next = el('button', { class: 'find-btn', type: 'button', title: 'הבא (Enter)', 'aria-label': 'ההתאמה הבאה', text: '▼' });
  const closeBtn = el('button', { class: 'find-btn', type: 'button', title: 'סגירה (Esc)', 'aria-label': 'סגירת החיפוש', text: '✕' });
  const bar = el('div', { class: 'find-bar', hidden: true, role: 'search' }, input, count, prev, next, closeBtn);
  threadEl.before(bar);

  function clearMarks() {
    if (hasHighlights) { CSS.highlights.delete('cl-find'); CSS.highlights.delete('cl-find-cur'); }
  }

  function collect(query) {
    ranges = [];
    if (!query) return;
    const walker = document.createTreeWalker(itemsEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      if (!parent || parent.closest('script,style,[hidden]')) continue;
      for (const at of logic.findOffsets(n.nodeValue, query)) {
        const r = document.createRange();
        r.setStart(n, at);
        r.setEnd(n, at + query.length);
        ranges.push(r);
      }
    }
  }

  function show(i) {
    index = i;
    count.textContent = ranges.length ? `${index + 1}/${ranges.length}` : input.value ? 'אין תוצאות' : '';
    if (index < 0) return;
    const r = ranges[index];
    if (hasHighlights) CSS.highlights.set('cl-find-cur', new Highlight(r));
    const target = r.startContainer.parentElement;
    if (target) target.scrollIntoView({ block: 'center' });
  }

  function run() {
    clearMarks();
    collect(input.value);
    if (hasHighlights && ranges.length) CSS.highlights.set('cl-find', new Highlight(...ranges));
    show(ranges.length ? 0 : -1);
  }

  function move(delta) {
    if (!ranges.length) return;
    show(logic.step(index, ranges.length, delta));
  }

  function open() {
    bar.hidden = false;
    input.focus();
    input.select();
    if (input.value) run();
  }

  function close() {
    bar.hidden = true;
    clearMarks();
    ranges = [];
    index = -1;
    const composer = document.getElementById('input');
    if (composer) composer.focus();
  }

  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); open(); }
  });

  CL.find = { open, close, isOpen: () => !bar.hidden };
})();
