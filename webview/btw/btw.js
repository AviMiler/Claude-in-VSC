// The /btw side panel page. Talks to src/panels/btw-panel.js: sends ask / cancel / clear / openLink,
// receives question (a question the main chat handed over), answer, focus. Nothing is stored here.
(function () {
  const { el, post } = CL;
  const input = document.getElementById('btw-input');
  const sendBtn = document.getElementById('btw-send');
  const itemsEl = document.getElementById('btw-items');
  const emptyEl = document.getElementById('btw-empty');
  const threadEl = document.getElementById('btw-thread');
  let seq = 0;
  let pending = null; // { id, body } of the question in flight
  const keepScrolled = () => { threadEl.scrollTop = threadEl.scrollHeight; };

  function refresh() {
    const busy = Boolean(pending);
    sendBtn.classList.toggle('stop', busy);
    sendBtn.title = busy ? 'עצירה' : 'שליחה';
    sendBtn.setAttribute('aria-label', busy ? 'עצירה' : 'שליחה');
    sendBtn.disabled = !busy && !input.value.trim();
    emptyEl.hidden = itemsEl.childElementCount > 0;
  }

  // Adds the user bubble and a waiting placeholder; the answer fills the placeholder.
  function show(id, text) {
    const body = el('div', { class: 'btw-wait', dir: 'auto', text: 'חושב...' });
    itemsEl.append(el('div', { class: 'msg-user', dir: 'auto', text }), el('div', { class: 'md' }, body));
    pending = { id, body };
    refresh();
    keepScrolled();
  }

  function send() {
    const text = input.value.trim();
    if (!text || pending) return;
    const id = `btw-w${Date.now()}-${++seq}`;
    input.value = '';
    show(id, text);
    post({ type: 'ask', id, text });
  }

  function answer(m) {
    if (!pending || pending.id !== m.id) return;
    const { body } = pending;
    pending = null;
    body.textContent = '';
    body.classList.remove('btw-wait');
    if (m.error) {
      body.classList.add('btw-error');
      body.textContent = m.error;
    } else CL.markdown.render(body, m.text);
    refresh();
    keepScrolled();
    input.focus();
  }

  function clearAll() {
    itemsEl.textContent = '';
    pending = null;
    post({ type: 'clear' });
    refresh();
    input.focus();
  }

  sendBtn.addEventListener('click', () => {
    if (pending) post({ type: 'cancel', id: pending.id });
    else send();
  });
  document.getElementById('clear-btn').addEventListener('click', clearAll);
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });

  // Code-block copy buttons and Markdown links, by delegation (same as the main chat thread).
  itemsEl.addEventListener('click', (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const code = copy.closest('.code-block').querySelector('pre').textContent;
      navigator.clipboard.writeText(code).then(() => {
        const label = copy.querySelector('span');
        label.textContent = 'הועתק';
        setTimeout(() => { label.textContent = 'העתקה'; }, 1400);
      });
      return;
    }
    const link = e.target.closest('a[data-link]');
    if (link) {
      e.preventDefault();
      post({ type: 'openLink', url: link.getAttribute('href') });
    }
  });
  itemsEl.addEventListener('auxclick', (e) => {
    if (e.target.closest('a[data-link]')) e.preventDefault();
  });

  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'question') show(m.id, m.text);
    else if (m.type === 'answer') answer(m);
    else if (m.type === 'focus') input.focus();
  });

  refresh();
  input.focus();
  post({ type: 'ready' });
})();
