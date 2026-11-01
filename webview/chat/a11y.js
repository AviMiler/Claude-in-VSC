// Screen-reader support: a polite live region for status changes (the thread itself is not live, so
// streamed text is not read token by token). Not tested with a real screen reader.
(function () {
  const { el } = CL;
  const threadEl = document.getElementById('thread');
  const itemsEl = document.getElementById('items');
  const spinnerEl = document.getElementById('spinner');

  threadEl.setAttribute('aria-live', 'off');
  threadEl.setAttribute('aria-label', 'השיחה');

  const live = el('div', { id: 'announcer', class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  document.body.append(live);

  // Setting the same text twice in a row is not announced again, so alternate with a zero-width mark.
  let flip = false;
  function announce(text) {
    flip = !flip;
    live.textContent = flip ? text : `${text}​`;
  }

  new MutationObserver(() => {
    announce(spinnerEl.hidden ? 'Claude סיים' : 'Claude עובד');
  }).observe(spinnerEl, { attributes: true, attributeFilter: ['hidden'] });

  // Cards that need an answer (permission, plan, question) and errors.
  new MutationObserver((records) => {
    if (CL.display.isReplaying()) return; // loading history: do not read old cards and errors aloud
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.matches('.tl-card') || n.querySelector('.tl-card')) announce('Claude מבקש תשובה');
        else if (n.matches('.tl-error') || n.querySelector('.tl-error')) announce('אירעה שגיאה');
      });
    }
  }).observe(itemsEl, { childList: true, subtree: true });

  CL.a11y = { announce };
})();
