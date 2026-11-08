// Usage gauge in the composer footer (replaces the context meter's text): a ring that fills with the
// window, orange from 70%, red from 85%. Hover or focus previews the card, a click (Enter/Space)
// keeps it open; Escape or a click outside closes it. Display only (F-10: no /compact on click).
// The card is a context breakdown of the current session in the style of the Claude app's
// "Context" panel; numbers and rows come from CL.usageLogic.
(function () {
  const { el, onOutsideClick } = CL;
  const L = CL.usageLogic;
  const NS = 'http://www.w3.org/2000/svg';
  const modeBtn = document.getElementById('mode-btn');
  const wrap = document.querySelector('.composer-wrap');

  const svg = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const ring = svg('svg', { class: 'gauge-ring', viewBox: '0 0 16 16', 'aria-hidden': 'true' });
  const fill = svg('circle', { class: 'gauge-fill', cx: 8, cy: 8, r: 6, pathLength: 100, transform: 'rotate(-90 8 8)' });
  ring.append(svg('circle', { class: 'gauge-track', cx: 8, cy: 8, r: 6 }), fill);
  const pctText = el('span', { class: 'gauge-pct' });
  const btn = el('button', {
    class: 'usage-gauge', id: 'usage-gauge', type: 'button',
    'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'usage-card',
  }, ring, pctText);
  btn.hidden = true;
  modeBtn.before(btn);

  const card = el('div', { class: 'popover usage-card', id: 'usage-card', role: 'dialog', 'aria-label': 'פירוט ההקשר', tabindex: '-1' });
  card.hidden = true;
  wrap.append(card);

  let last = null; // the last 'context' message
  let pinned = false; // opened by a click/keyboard (stays until closed), not only by hover
  let cleanup = null;
  let hoverTimer = null;

  const num = (n) => el('bdi', { class: 'num', dir: 'ltr', text: L.fmt(n) });

  function render() {
    const b = L.breakdown(last);
    if (!b) return card.replaceChildren();
    // Widths through CSSOM: the webview CSP has no 'unsafe-inline' for style attributes.
    const bar = el('div', { class: 'usage-bar', 'aria-hidden': 'true' }, ...L.segments(b.rows, b.max).map((s) => {
      const seg = el('span', { class: `usage-seg uc-${s.key}` });
      seg.style.width = `${s.width}%`;
      return seg;
    }));
    const rows = el('div', { class: 'usage-rows' }, ...b.rows.map((r) => el('div', { class: 'usage-row' },
      el('span', { class: `dot uc-${r.key}`, 'aria-hidden': 'true' }),
      el('span', { class: 'usage-name', text: r.label }),
      el('span', { class: 'usage-tokens' }, num(r.tokens)),
      el('bdi', { class: 'usage-share', text: r.pct }))));
    const extra = [];
    for (const d of b.deferred) {
      extra.push(el('div', { class: 'usage-row sub' },
        el('span', { class: 'dot', 'aria-hidden': 'true' }),
        el('span', { class: 'usage-name', text: d.label }),
        el('span', { class: 'usage-tokens' }, num(d.tokens)),
        el('span', { class: 'usage-share' })));
    }
    const facts = L.factsLine(last.memoryFiles, last.mcpServers);
    card.replaceChildren(
      el('div', { class: 'usage-head' },
        el('span', { class: 'usage-title', text: 'הקשר' }),
        el('span', { class: `usage-pct lvl-${b.level}` }, el('bdi', { text: `${b.pct}%` }), ' בשימוש')),
      el('div', { class: 'usage-total' }, num(b.used), ' מתוך ', num(b.max), ' אסימונים'),
      bar,
      rows,
      extra.length ? el('div', { class: 'usage-rows usage-deferred', title: 'לא נספרים בחלון עד שנטענים' }, ...extra) : null,
      el('div', { class: 'usage-foot' },
        facts ? el('div', { text: facts }) : null,
        el('div', { text: L.sourceText(last.source) }),
        el('div', {}, 'לכיווץ השיחה: ', el('bdi', { class: 'num', dir: 'ltr', text: '/compact' }))),
    );
  }

  // Physical left: the card starts over the gauge and is kept inside the composer at any width.
  function place() {
    const w = wrap.getBoundingClientRect();
    const a = btn.getBoundingClientRect();
    const room = w.width - card.offsetWidth - 8;
    card.style.left = `${Math.max(8, Math.min(a.left - w.left, room))}px`;
  }

  function open(pin) {
    if (btn.hidden) return;
    pinned = pinned || pin;
    if (!card.hidden) return;
    render();
    card.hidden = false;
    place();
    btn.setAttribute('aria-expanded', 'true');
    cleanup = onOutsideClick(card, btn, close);
  }

  function close() {
    clearTimeout(hoverTimer);
    card.hidden = true;
    pinned = false;
    btn.setAttribute('aria-expanded', 'false');
    if (cleanup) cleanup();
    cleanup = null;
  }

  btn.addEventListener('click', () => {
    if (!card.hidden && pinned) return close();
    open(true);
  });
  btn.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => open(false), 250);
  });
  const leave = () => {
    clearTimeout(hoverTimer);
    if (pinned) return;
    hoverTimer = setTimeout(() => {
      if (!pinned && !btn.matches(':hover') && !card.matches(':hover')) close();
    }, 200);
  };
  btn.addEventListener('mouseleave', leave);
  card.addEventListener('mouseleave', leave);
  card.addEventListener('mouseenter', () => clearTimeout(hoverTimer));
  const onEsc = (e) => {
    if (e.key !== 'Escape' || card.hidden) return;
    e.preventDefault();
    e.stopPropagation();
    close();
    btn.focus();
  };
  btn.addEventListener('keydown', onEsc);
  card.addEventListener('keydown', onEsc);

  CL.contextMeter = {
    // m: the host's { used, max, source, categories, memoryFiles, mcpServers }; null clears the
    // gauge (new conversation).
    set(m) {
      const ok = Boolean(m) && Number.isFinite(m.used) && Number.isFinite(m.max) && m.max > 0;
      btn.hidden = !ok;
      if (!ok) {
        last = null;
        return close();
      }
      last = m;
      const pct = L.percent(m.used, m.max);
      const lvl = L.level(pct);
      fill.style.strokeDasharray = `${pct} 100`;
      pctText.textContent = `${pct}%`;
      btn.classList.toggle('warn', lvl === 'warn');
      btn.classList.toggle('danger', lvl === 'danger');
      btn.title = L.gaugeLabel(m.used, m.max);
      btn.setAttribute('aria-label', btn.title);
      if (!card.hidden) render();
    },
    close,
  };
})();
