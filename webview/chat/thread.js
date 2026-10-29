// Renders UI events (see src/panels/event-translator.js) into the thread.
(function () {
  const { el, post } = CL;

  const itemsEl = document.getElementById('items');
  const emptyEl = document.getElementById('empty');
  const threadEl = document.getElementById('thread');

  let turn = null;          // the current assistant turn container
  const blocks = new Map(); // key -> {node, body, type, text, raf}
  const tools = new Map();  // toolUseId -> {node, name, input, result}

  function showEmpty(on) {
    emptyEl.hidden = !on;
  }

  function nearBottom() {
    return threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 60;
  }

  function scrollToBottom() {
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  function currentTurn() {
    if (!turn) {
      turn = el('div', { class: 'turn' });
      itemsEl.append(turn);
      showEmpty(false);
    }
    return turn;
  }

  function endTurn() {
    turn = null;
  }

  function addUser(text) {
    endTurn();
    itemsEl.append(el('div', { class: 'msg-user', dir: 'auto', text }));
    showEmpty(false);
  }

  // --- text & thinking blocks ---------------------------------------------------------------

  function renderBlock(b) {
    b.raf = 0;
    if (b.type === 'text') CL.markdown.render(b.body, b.text);
    else b.body.textContent = b.text;
  }

  function createBlock(key, type) {
    let node;
    let body;
    if (type === 'thinking') {
      body = el('div', { class: 'thinking-body', dir: 'auto' });
      node = el('div', { class: 'tl tl-thinking' },
        el('details', { class: 'thinking' }, el('summary', { text: 'חשיבה' }), body));
    } else {
      body = el('div', { class: 'md', dir: 'auto' });
      node = el('div', { class: 'tl tl-text' }, body);
    }
    currentTurn().append(node);
    const b = { node, body, type, text: '', raf: 0 };
    blocks.set(key, b);
    return b;
  }

  function onDelta(ev) {
    const b = blocks.get(ev.key) || createBlock(ev.key, ev.blockType);
    b.text += ev.text || '';
    if (!b.raf) b.raf = requestAnimationFrame(() => renderBlock(b));
  }

  function onBlock(ev) {
    let b = blocks.get(ev.key);
    if (!b) {
      if (!ev.text) return; // redacted thinking or an empty text block
      b = createBlock(ev.key, ev.blockType);
    }
    if (ev.text || !b.text) b.text = ev.text;
    if (b.raf) cancelAnimationFrame(b.raf);
    renderBlock(b);
    if (b.type === 'thinking' && !b.text) b.node.remove();
  }

  // --- tool rows ------------------------------------------------------------------------------

  function renderTool(t) {
    const s = CL.tools.summary(t.name, t.input);
    t.summaryEl.textContent = s.text;
    t.summaryEl.classList.toggle('link', Boolean(s.path));
    t.path = s.path;
    t.line = s.line;
    if (t.node.classList.contains('open')) {
      t.bodyEl.replaceChildren(...CL.tools.body(t.name, t.input, t.result));
    }
  }

  function setToolState(t, state) {
    t.node.classList.remove('running', 'ok', 'err', 'denied');
    t.node.classList.add(state);
  }

  function onTool(ev) {
    let t = tools.get(ev.id);
    if (!t) {
      const summaryEl = el('span', { class: 'tool-summary', dir: 'auto' });
      const bodyEl = el('div', { class: 'tool-body' });
      const head = el('button', { class: 'tool-head', type: 'button' },
        el('span', { class: 'tool-name', text: CL.tools.displayName(ev.name) }),
        summaryEl,
        el('span', { class: 'tool-toggle', text: '▾' }));
      const node = el('div', { class: 'tl tl-tool running' }, head, bodyEl);
      t = { node, summaryEl, bodyEl, name: ev.name, input: ev.input || {}, result: null };
      head.addEventListener('click', (e) => {
        if (e.target === summaryEl && t.path) {
          post({ type: 'openFile', path: t.path, line: t.line });
          return;
        }
        node.classList.toggle('open');
        renderTool(t);
      });
      tools.set(ev.id, t);
      currentTurn().append(node);
    }
    if (ev.final) t.input = ev.input || {};
    renderTool(t);
  }

  function onToolResult(ev) {
    const t = tools.get(ev.toolUseId);
    if (!t) return;
    t.result = { text: ev.text || '', isError: ev.isError };
    setToolState(t, ev.isError ? 'err' : 'ok');
    renderTool(t);
  }

  // --- results & errors -------------------------------------------------------------------------

  function formatResult(ev) {
    const parts = [];
    if (typeof ev.durationMs === 'number') parts.push(`${(ev.durationMs / 1000).toFixed(1)} שנ׳`);
    if (typeof ev.costUsd === 'number' && ev.costUsd > 0) parts.push(`$${ev.costUsd.toFixed(4)}`);
    if (ev.inputTokens || ev.outputTokens) {
      const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n || 0));
      parts.push(`קלט ${k(ev.inputTokens)} · פלט ${k(ev.outputTokens)}`);
    }
    return parts.join(' · ');
  }

  function addError(text) {
    currentTurn().append(el('div', { class: 'tl tl-error' }, el('div', { class: 'error-box', dir: 'auto', text })));
  }

  function onResult(ev) {
    for (const t of tools.values()) if (t.node.classList.contains('running')) setToolState(t, 'denied');
    if (ev.isError && ev.errorText) addError(ev.errorText);
    const line = formatResult(ev);
    if (ev.interrupted) currentTurn().append(el('div', { class: 'result-line', text: `■ הופסק${line ? ` · ${line}` : ''}` }));
    else if (line && turn) turn.append(el('div', { class: `result-line${ev.isError ? ' err' : ''}`, text: `${ev.isError ? '✕' : '✓'} ${line}` }));
    endTurn();
  }

  function addNode(node) {
    currentTurn().append(node);
  }

  function apply(events) {
    const stick = nearBottom();
    for (const ev of events) {
      switch (ev.kind) {
        case 'delta': onDelta(ev); break;
        case 'block': onBlock(ev); break;
        case 'tool': onTool(ev); break;
        case 'toolResult': onToolResult(ev); break;
        case 'user': addUser(ev.text); break;
        case 'result': onResult(ev); break;
        default: break;
      }
    }
    if (stick) requestAnimationFrame(scrollToBottom);
  }

  function reset() {
    itemsEl.replaceChildren();
    blocks.clear();
    tools.clear();
    endTurn();
    showEmpty(true);
  }

  // Code-block copy buttons and Markdown links, by delegation.
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

  // Middle-click would otherwise let VS Code open the link itself, bypassing the http(s) check.
  itemsEl.addEventListener('auxclick', (e) => {
    if (e.target.closest('a[data-link]')) e.preventDefault();
  });

  CL.thread = { apply, addUser, addError, addNode, reset, scrollToBottom, endTurn };
})();
