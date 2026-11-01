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

  function send() {
    const text = input.value;
    if (!text.trim() || state.busy) return;
    CL.slashMenu.close();
    post({ type: 'send', text });
    CL.app.userSent(text);
    input.value = '';
    autoresize();
  }

  // "/" menu: open while the text is a single "/word" at the very start.
  function updateSlash() {
    const m = /^\/(\S*)$/.exec(input.value.slice(0, input.selectionStart));
    if (!m || input.value.slice(input.selectionStart).trim()) return CL.slashMenu.close();
    CL.slashMenu.update(m[1], (cmd) => {
      input.value = `/${cmd.name} `;
      CL.slashMenu.close();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      autoresize();
      refreshSend();
    });
  }

  input.addEventListener('input', () => {
    autoresize();
    refreshSend();
    updateSlash();
  });

  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (CL.slashMenu.onKey(e)) {
      e.preventDefault();
      return;
    }
    if (rewindSeq.feed(e) && CL.composer.onRewind) CL.composer.onRewind();
    if (CL.keys.matches(e, state.keys.send)) {
      e.preventDefault();
      send();
    } else if (CL.keys.matches(e, state.keys.newLine)) {
      e.preventDefault();
      input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end');
      input.dispatchEvent(new Event('input'));
    }
  });

  input.addEventListener('blur', () => setTimeout(() => CL.slashMenu.close(), 100));

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
  };

  refreshMode();
  refreshModel();
  refreshSend();
})();
