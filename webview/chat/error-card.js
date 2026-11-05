// The Hebrew card shown in the chat when the CLI fails (data built by src/panels/error-card.js).
(function () {
  const { el, post } = CL;

  function show(card) {
    const buttons = card.buttons.map((b) =>
      el('button', { class: 'info-card-btn', type: 'button', text: b.label, onclick: () => post({ type: 'openSettings', target: b.target }) }));
    CL.thread.addCard(el('div', { class: 'info-card error-card', role: 'alert' },
      el('div', { class: 'card-title', dir: 'auto', text: card.title }),
      card.warning ? el('div', { class: 'error-card-warning', dir: 'auto', text: `⚠ ${card.warning}` }) : null,
      el('ul', { class: 'error-card-list' }, card.checks.map((c) => el('li', { dir: 'auto', text: c }))),
      el('div', { class: 'card-actions' }, buttons, CL.thread.retryButton())));
    CL.thread.scrollToBottom();
  }

  CL.errorCard = { show };
})();
