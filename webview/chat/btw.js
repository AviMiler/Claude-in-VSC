// `/btw <question>`: a side-question card shown in the thread. It is not a turn: no queue, no
// busy state, not part of the model's context. The host answers it with its own short-lived,
// tool-less, history-less CLI process (src/cli/btw.js). Nothing is stored; the card is closable.
(function () {
  const { el, post } = CL;
  const cards = new Map();
  let seq = 0;

  function ask(question) {
    const id = `btw-${Date.now()}-${++seq}`;
    const body = el('div', { class: 'btw-body', dir: 'auto', text: 'חושב...' });
    const close = el('button', { class: 'info-card-btn', type: 'button', text: 'סגירה' });
    const node = el('div', { class: 'info-card btw-card' },
      el('div', { class: 'btw-title', text: 'שאלה צדדית (בלי כלים ובלי היסטוריה)' }),
      el('div', { class: 'btw-question', dir: 'auto', text: question }),
      body,
      close);
    close.onclick = () => {
      post({ type: 'btwCancel', id });
      cards.delete(id);
      node.remove();
    };
    cards.set(id, { node, body });
    CL.thread.addNode(node);
    CL.thread.scrollToBottom();
    post({ type: 'btw', id, question });
  }

  function result(m) {
    const card = cards.get(m.id);
    if (!card) return; // closed before the answer arrived
    cards.delete(m.id);
    card.body.textContent = '';
    if (m.error) {
      card.body.classList.add('btw-error');
      card.body.textContent = m.error;
    } else CL.markdown.render(card.body, m.text);
  }

  CL.btw = { ask, result };
})();
