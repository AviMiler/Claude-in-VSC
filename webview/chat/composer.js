// The input box and its footer: send/stop, the mode and model pickers, and the "/" trigger.
(function () {
  const { post } = CL;

  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send-btn');
  const modeBtn = document.getElementById('mode-btn');
  const modelBtn = document.getElementById('model-btn');
  const cwdNote = document.getElementById('cwd-note');

  const MODES = [
    { value: 'default', icon: '✎', label: 'ידני', desc: 'Claude יבקש אישור לפני עריכת קבצים והרצת פקודות' },
    { value: 'acceptEdits', icon: '⏵⏵', label: 'עריכה אוטומטית', desc: 'Claude יערוך קבצים בלי לשאול' },
    { value: 'auto', icon: '✦', label: 'אוטומטי', desc: 'ה-CLI מחליט לבד, המסווג עלול לטעות', warn: true },
    { value: 'plan', icon: '⏸', label: 'תכנון', desc: 'Claude יחקור ויציע תוכנית בלי לשנות דבר' },
    { value: 'bypassPermissions', icon: '⚠', label: 'ללא הרשאות', desc: 'Claude יפעל בלי לבקש שום אישור', danger: true },
  ];

  const state = {
    busy: false,
    mode: 'default',
    model: 'default',
    models: [],
    settings: { useCtrlEnterToSend: false, allowBypass: false },
    keys: CL.keys.resolve(),
  };
  // Double Esc (or the configured rewind shortcut); CL.composer.onRewind is the hook for the checkpoints package.
  let rewindSeq = CL.keys.createSequence(state.keys.rewind);

  function autoresize() {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  function refreshSend() {
    sendBtn.classList.toggle('stop', state.busy);
    sendBtn.disabled = !state.busy && !input.value.trim();
    sendBtn.title = state.busy ? 'עצירה' : 'שליחה';
    sendBtn.setAttribute('aria-label', sendBtn.title);
  }

  function chip(btn, icon, label) {
    btn.replaceChildren(CL.el('span', { text: icon }), CL.el('span', { text: label }));
  }

  function refreshMode() {
    const m = MODES.find((x) => x.value === state.mode) || MODES[0];
    chip(modeBtn, m.icon, m.label);
    modeBtn.classList.toggle('active-mode', m.value !== 'default');
    modeBtn.classList.toggle('danger', Boolean(m.danger));
  }

  function modelLabel(value) {
    const m = state.models.find((x) => x.value === value);
    return m ? m.displayName || m.value : value === 'default' ? 'ברירת מחדל' : value;
  }

  function refreshModel() {
    modelBtn.hidden = !state.models.length;
    chip(modelBtn, '◇', modelLabel(state.model));
  }

  const history = CL.prompt.createHistory();
  const queue = CL.prompt.createQueue();

  function clearInput() {
    input.value = '';
    autoresize();
    refreshSend();
  }

  function dispatch(text) {
    post({ type: 'send', text });
    CL.app.userSent(text);
  }

  // Terminal-only commands are never sent to the model: show the card instead.
  function showTerminalCard(text) {
    CL.slashMenu.close();
    CL.thread.addCard(CL.el('div', { class: 'info-card', role: 'status' },
      CL.el('div', { class: 'info-card-text', dir: 'auto', text: `הפקודה /${CL.prompt.commandName(text)} זמינה רק בטרמינל` }),
      CL.el('button', { class: 'info-card-btn', type: 'button', text: 'פתיחה בטרמינל', onclick: () => post({ type: 'openTerminal' }) })));
    CL.thread.scrollToBottom();
    clearInput();
  }

  // While a turn runs a new message waits (in memory) as a grey bubble the user can cancel.
  function enqueue(text) {
    const item = queue.push(text);
    CL.thread.addQueued(item, () => {
      queue.cancel(item.id);
      CL.thread.removeQueued(item.id);
    });
    CL.thread.scrollToBottom();
  }

  function send() {
    const text = input.value;
    if (!text.trim()) return;
    if (CL.prompt.isTerminalOnly(text, CL.slashMenu.getMeta())) return showTerminalCard(text);
    CL.slashMenu.close();
    history.add(text);
    // /plan and /plan open are the extension's own commands: never sent to the model.
    const plan = /^\/plan(\s+open)?\s*$/i.exec(text.trim());
    if (plan) {
      post({ type: 'planCommand', open: Boolean(plan[1]) });
      return clearInput();
    }
    clearInput();
    if (state.busy) enqueue(text);
    else dispatch(text);
  }

  function sendNextQueued() {
    if (state.busy) return;
    const item = queue.shift();
    if (!item) return;
    CL.thread.removeQueued(item.id);
    dispatch(item.text);
  }

  // "/" menu: open while the text is a single "/word" at the very start.
  function updateSlash() {
    const m = /^\/(\S*)$/.exec(input.value.slice(0, input.selectionStart));
    if (!m || input.value.slice(input.selectionStart).trim()) return CL.slashMenu.close();
    CL.slashMenu.update(m[1], (cmd) => {
      if (cmd.group === 'terminal') return showTerminalCard(`/${cmd.name}`);
      input.value = `/${cmd.name} `;
      CL.slashMenu.close();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      autoresize();
      refreshSend();
    });
  }

  // "@" menu: the word being typed right before the caret starts with "@".
  function updateMention() {
    const before = input.value.slice(0, input.selectionStart);
    const m = /(^|\s)@([^\s@]*)$/.exec(before);
    if (!m) return CL.mentions.close();
    const start = before.length - m[2].length - 1;
    CL.mentions.request(m[2], (item) => {
      const text = /\s/.test(item.path) ? `@"${item.path}"` : `@${item.path}`;
      insertAt(start, input.selectionStart, item.isDir ? text : `${text} `);
      CL.mentions.close();
    });
  }

  function insertAt(from, to, text) {
    input.setRangeText(text, from, to, 'end');
    input.focus();
    autoresize();
    refreshSend();
    input.dispatchEvent(new Event('input'));
  }

  input.addEventListener('input', () => {
    autoresize();
    refreshSend();
    updateSlash();
    updateMention();
  });

  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (CL.mentions.onKey(e) || CL.slashMenu.onKey(e)) {
      e.preventDefault();
      return;
    }
    if (rewindSeq.feed(e) && CL.composer.onRewind) CL.composer.onRewind();
    if (e.key === 'ArrowUp' && !e.shiftKey && input.selectionStart === 0 && input.selectionEnd === 0) {
      const older = history.prev(input.value);
      if (older !== null) {
        e.preventDefault();
        input.value = older;
        input.setSelectionRange(0, 0);
        autoresize();
        refreshSend();
      }
    } else if (e.key === 'ArrowDown' && history.browsing && input.selectionStart === input.value.length) {
      const newer = history.next();
      if (newer !== null) {
        e.preventDefault();
        input.value = newer;
        input.setSelectionRange(newer.length, newer.length);
        autoresize();
        refreshSend();
      }
    }
    if (CL.keys.matches(e, state.keys.send)) {
      e.preventDefault();
      send();
    } else if (CL.keys.matches(e, state.keys.newLine)) {
      e.preventDefault();
      input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end');
      input.dispatchEvent(new Event('input'));
    }
  });

  input.addEventListener('blur', () => setTimeout(() => { CL.slashMenu.close(); CL.mentions.close(); }, 100));

  sendBtn.addEventListener('click', () => {
    if (state.busy) post({ type: 'interrupt' });
    else send();
  });

  modeBtn.addEventListener('click', () => {
    const items = MODES
      .filter((m) => m.value !== 'bypassPermissions' || state.settings.allowBypass || state.mode === m.value)
      .map((m) => ({ ...m, checked: m.value === state.mode }));
    CL.menu.open(modeBtn, items, (value) => post({ type: 'setMode', value }));
  });

  modelBtn.addEventListener('click', () => {
    const items = state.models.map((m) => ({
      value: m.value,
      label: m.displayName || m.value,
      desc: m.description,
      checked: m.value === state.model,
    }));
    CL.menu.open(modelBtn, items, (value) => post({ type: 'setModel', value }));
  });

  CL.composer = {
    setBusy(on) {
      state.busy = on;
      refreshSend();
    },
    setMode(value) {
      state.mode = value;
      refreshMode();
    },
    setModels(models, current) {
      state.models = models || [];
      if (current) state.model = current;
      refreshModel();
    },
    setModel(value) {
      state.model = value;
      refreshModel();
    },
    setSettings(s) {
      state.settings = { ...state.settings, ...s };
      state.keys = CL.keys.resolve(state.settings);
      rewindSeq = CL.keys.createSequence(state.keys.rewind);
      input.placeholder = state.keys.send === CL.keys.DEFAULTS.send
        ? 'כתבו ל-Claude… (הקלידו / לפקודות וסקילים)'
        : `כתבו ל-Claude… (${state.keys.send} לשליחה, הקלידו / לפקודות)`;
    },
    setNoFolder(on) {
      cwdNote.hidden = !on;
      cwdNote.textContent = on ? 'לא נפתחה תיקייה – Claude עובד בתיקיית הבית' : '';
    },
    focus() {
      input.focus();
    },
    sendNextQueued,
    insertText(text) {
      insertAt(input.selectionStart, input.selectionEnd, text);
    },
    // A new or loaded conversation starts with its own history and an empty queue.
    resetConversation(sentTexts) {
      history.reset(sentTexts);
      queue.clear();
      CL.thread.clearQueued();
    },
  };

  refreshMode();
  refreshModel();
  refreshSend();
})();
