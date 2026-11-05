// The input box and its footer: "+" (attach), "/" (commands), the model pill, the mode label and
// send/stop. Each conversation keeps its own draft and queue: they leave with `uiState()` when the
// user switches away and come back with `restore()`.
(function () {
  const { post } = CL;

  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send-btn');
  const modeBtn = document.getElementById('mode-btn');
  const modelBtn = document.getElementById('model-btn');
  const cwdNote = document.getElementById('cwd-note');

  // Labels like the official mode button ("Ask before edits", "Edit automatically", "Plan mode").
  const MODES = [
    { value: 'default', icon: '✋', label: 'לשאול לפני עריכה', desc: 'Claude יבקש אישור לפני עריכת קבצים והרצת פקודות' },
    { value: 'acceptEdits', icon: '</>', label: 'עריכה אוטומטית', desc: 'Claude יערוך קבצים בלי לשאול' },
    { value: 'auto', icon: '✦', label: 'אוטומטי', desc: 'ה-CLI מחליט לבד, המסווג עלול לטעות', warn: true },
    { value: 'plan', icon: '⏸', label: 'מצב תכנון', desc: 'Claude יחקור ויציע תוכנית בלי לשנות דבר' },
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
    sendBtn.disabled = !state.busy && !input.value.trim() && !attached.length;
    sendBtn.title = state.busy ? 'עצירה' : 'שליחה';
    sendBtn.setAttribute('aria-label', sendBtn.title);
  }

  function chip(btn, icon, label) {
    btn.replaceChildren(CL.el('span', { class: 'chip-icon', dir: 'ltr', text: icon, 'aria-hidden': 'true' }), CL.el('span', { class: 'chip-label', text: label }));
  }

  function refreshMode() {
    const m = MODES.find((x) => x.value === state.mode) || MODES[0];
    chip(modeBtn, m.icon, m.label);
    modeBtn.setAttribute('aria-label', `מצב הרשאות: ${m.label}`);
    modeBtn.classList.toggle('active-mode', m.value !== 'default');
    modeBtn.classList.toggle('danger', Boolean(m.danger));
  }

  function modelLabel(value) {
    const m = state.models.find((x) => x.value === value);
    return m ? m.displayName || m.value : value === 'default' ? 'ברירת מחדל' : value;
  }

  function refreshModel() {
    modelBtn.hidden = !state.models.length;
    modelBtn.replaceChildren(CL.el('span', { class: 'chip-label', dir: 'auto', text: modelLabel(state.model) }));
    modelBtn.setAttribute('aria-label', `מודל: ${modelLabel(state.model)}`);
  }

  const history = CL.prompt.createHistory();
  const queue = CL.prompt.createQueue();

  function clearInput() {
    input.value = '';
    autoresize();
    refreshSend();
  }

  function dispatch(text, images = []) {
    post({ type: 'send', text, images });
    CL.app.userSent(text, images.length);
  }

  // --- attached images (pasted or dropped); kept in memory until sent ---------------------------
  const attachmentsEl = document.getElementById('attachments');
  let attached = [];
  const IMAGE_ONLY_TEXT = 'ראו את התמונה המצורפת.';

  function renderAttachments() {
    attachmentsEl.hidden = !attached.length;
    attachmentsEl.replaceChildren(...attached.map((img, idx) => CL.el('span', { class: 'attach-chip' },
      CL.el('img', { src: `data:${img.mediaType};base64,${img.data}`, alt: 'תמונה מצורפת' }),
      CL.el('button', {
        type: 'button',
        title: 'הסרה',
        'aria-label': 'הסרת התמונה',
        text: '✕',
        onclick: () => { attached.splice(idx, 1); renderAttachments(); refreshSend(); },
      }))));
  }

  function addImage(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const m = /^data:([^;]+);base64,(.*)$/.exec(String(reader.result));
      const error = m ? CL.prompt.validateImage(m[1], m[2]) : 'לא ניתן לקרוא את התמונה';
      if (error) return CL.app.notice(error);
      attached.push({ mediaType: m[1], data: m[2] });
      renderAttachments();
      return refreshSend();
    };
    reader.readAsDataURL(file);
  }

  // "+": attach an image (file picker) or mention a file (types "@" and opens the @ list).
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', () => {
    [...fileInput.files].forEach(addImage);
    fileInput.value = '';
  });
  attachBtn.addEventListener('click', () => {
    CL.menu.open(attachBtn, [
      { value: 'image', icon: '🖼', label: 'צירוף תמונה…', desc: 'PNG, JPEG, GIF או WebP (אפשר גם להדביק)' },
      { value: 'mention', icon: '@', label: 'אזכור קובץ מהפרויקט…', desc: 'קובץ או תיקייה כ-@path' },
    ], (value) => {
      if (value === 'image') fileInput.click();
      else insertAt(input.selectionStart, input.selectionEnd, `${/(^|\s)$/.test(input.value.slice(0, input.selectionStart)) ? '' : ' '}@`);
    });
  });

  // "/": opens the commands menu (the same as typing "/" at the start of an empty box).
  document.getElementById('slash-btn').addEventListener('click', () => {
    input.focus();
    if (input.value.trim()) return;
    input.value = '/';
    input.setSelectionRange(1, 1);
    input.dispatchEvent(new Event('input'));
  });

  input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData ? e.clipboardData.files : [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    files.forEach(addImage);
  });

  // Files dragged in from the Explorer (Shift) become @path mentions; image files from outside are attached.
  const composerEl = document.querySelector('.composer');
  // dragenter and dropEffect matter: without them the webview does not accept the drop (F-11).
  const allowDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  composerEl.addEventListener('dragenter', allowDrop);
  composerEl.addEventListener('dragover', allowDrop);
  composerEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    const uris = (dt.getData('text/uri-list') || '').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
    if (uris.length) post({ type: 'dropUris', uris });
    const files = [...dt.files, ...[...(dt.items || [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile())];
    const images = files.filter((f, idx) => f && f.type.startsWith('image/') && files.indexOf(f) === idx);
    images.forEach(addImage);
    CL.post({ type: 'log', tag: 'drop', text: `uris=${uris.length} files=${dt.files.length} images=${images.length}` });
  });

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
    const imageCount = attached.length;
    const item = queue.push(text, attached);
    CL.post({ type: 'log', tag: 'queue', text: `add (${text.length} chars, ${imageCount} images)` });
    attached = [];
    renderAttachments();
    CL.thread.addQueued(item, () => {
      queue.cancel(item.id);
      CL.post({ type: 'log', tag: 'queue', text: 'cancel' });
      CL.thread.removeQueued(item.id);
    });
    if (CL.display.scrollOnSend()) CL.thread.scrollToBottom();
  }

  function send() {
    let text = input.value;
    if (!text.trim()) {
      if (!attached.length) return;
      text = IMAGE_ONLY_TEXT; // images alone are allowed (F-11); the CLI needs some text with them
    }
    if (CL.prompt.isTerminalOnly(text, CL.slashMenu.getMeta())) return showTerminalCard(text);
    CL.slashMenu.close();
    history.add(text);
    // /plan and /plan open are the extension's own commands: never sent to the model.
    const plan = /^\/plan(\s+open)?\s*$/i.exec(text.trim());
    if (plan) {
      post({ type: 'planCommand', open: Boolean(plan[1]) });
      return clearInput();
    }
    if (/^\/diff\s*$/i.test(text.trim())) {
      post({ type: 'diffCommand' });
      return clearInput();
    }
    clearInput();
    if (state.busy) enqueue(text);
    else {
      const images = attached;
      attached = [];
      renderAttachments();
      dispatch(text, images);
    }
  }

  function sendNextQueued() {
    if (state.busy) return;
    const item = queue.shift();
    if (!item) return;
    CL.thread.removeQueued(item.id);
    CL.post({ type: 'log', tag: 'queue', text: 'send next queued' });
    dispatch(item.text, item.images);
  }

  // "/" menu: open while the text is a single "/word" at the very start.
  function updateSlash() {
    const m = /^\/(\S*)$/.exec(input.value.slice(0, input.selectionStart));
    if (!m || input.value.slice(input.selectionStart).trim()) return CL.slashMenu.close();
    CL.slashMenu.update(m[1], (cmd) => {
      if (cmd.group === 'terminal') return showTerminalCard(`/${cmd.name}`);
      if (cmd.local) { // the extension's own command: run it now, no second Enter
        input.value = `/${cmd.name}`;
        return send();
      }
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
      const target = item.abs || item.path; // absolute: the CLI does not expand "@relative" (F-4)
      const text = /\s/.test(target) ? `@"${target}"` : `@${target}`;
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

  // During a turn the same pill offers "stop and switch": the host asks for confirmation and
  // explains what is lost (src/panels/model-switch.js).
  modelBtn.addEventListener('click', () => {
    const busy = state.busy;
    const items = state.models
      .filter((m) => !busy || m.value !== state.model)
      .map((m) => ({
        value: m.value,
        label: m.displayName || m.value,
        desc: busy ? 'עצירת התור והחלפת מודל' : m.description,
        checked: m.value === state.model,
      }));
    if (!items.length) return;
    CL.menu.open(modelBtn, items, (value) => post({ type: busy ? 'stopAndSwitchModel' : 'setModel', value }));
  });

  CL.composer = {
    setBusy(on) {
      state.busy = on;
      // The mode picker is disabled during a turn (PLAN.md section 2, stage 8); the model pill
      // stays enabled and turns into "stop and switch".
      modeBtn.disabled = on;
      modelBtn.title = on ? 'עצירה והחלפת מודל' : 'מודל';
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
    // What leaves with the conversation when the user switches away (attached images stay here).
    uiState() {
      return { draft: input.value, queue: queue.list().map((i) => ({ text: i.text, images: i.images })) };
    },
    // A conversation shown again: its up-arrow history, draft and still-queued messages.
    restore({ sent, ui }) {
      history.reset(sent || []);
      queue.clear();
      CL.thread.clearQueued();
      input.value = (ui && ui.draft) || '';
      autoresize();
      refreshSend();
      for (const q of (ui && ui.queue) || []) {
        const item = queue.push(q.text, q.images || []);
        CL.thread.addQueued(item, () => { queue.cancel(item.id); CL.thread.removeQueued(item.id); });
      }
    },
  };

  refreshMode();
  refreshModel();
  refreshSend();
})();
