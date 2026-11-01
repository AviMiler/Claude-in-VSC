// Bootstraps the chat webview and dispatches host -> webview messages.
(function () {
  const { post } = CL;
  // Esc Esc (keybindings.rewind) opens the host's checkpoints menu.
  CL.composer.onRewind = () => post({ type: 'rewindMenu' });

  const spinner = document.getElementById('spinner');
  const spinnerVerb = document.getElementById('spinner-verb');
  const headerTitle = document.getElementById('header-title');
  const notice = document.getElementById('notice');

  const VERBS = ['חושב', 'מעיין', 'בודק', 'מנתח', 'כותב', 'מתכנן', 'שוקל'];
  const STATUS_VERBS = { compacting: 'מכווץ את ההקשר' };
  let verbTimer = 0;
  let statusVerb = null;

  function setVerb() {
    const verb = statusVerb || VERBS[Math.floor(Math.random() * VERBS.length)];
    spinnerVerb.textContent = `${verb}…`;
  }

  function setBusy(on) {
    CL.composer.setBusy(on);
    spinner.hidden = !on;
    clearInterval(verbTimer);
    statusVerb = null;
    if (on) {
      setVerb();
      verbTimer = setInterval(setVerb, 3000);
    }
  }

  let titled = false;

  function setTitle(text) {
    titled = Boolean(text);
    headerTitle.textContent = text || 'שיחות קודמות';
  }

  function showNotice(text) {
    notice.textContent = text;
    notice.hidden = false;
    setTimeout(() => { notice.hidden = true; }, 6000);
  }

  function onEvents(events) {
    for (const ev of events) {
      if (ev.kind === 'session') {
        CL.history.setCurrent(ev.sessionId);
        if (ev.permissionMode) CL.composer.setMode(ev.permissionMode);
        if (ev.skills || ev.terminalOnly) CL.slashMenu.setMeta({ skills: ev.skills, terminalOnly: ev.terminalOnly });
      } else if (ev.kind === 'status') {
        statusVerb = STATUS_VERBS[ev.status] || null;
        if (!spinner.hidden) setVerb();
      }
    }
    CL.thread.apply(events);
    if (events.some((ev) => ev.kind === 'result')) {
      setBusy(false);
      CL.composer.sendNextQueued();
    }
  }

  const HANDLERS = {
    init(m) {
      CL.tools.setCwd(m.cwd);
      CL.composer.setSettings(m.settings);
      CL.composer.setMode(m.permissionMode);
      CL.composer.setNoFolder(m.noFolder);
      CL.composer.focus();
    },
    settings: (m) => CL.composer.setSettings(m.settings),
    commands: (m) => CL.slashMenu.setCommands(m.commands),
    models: (m) => CL.composer.setModels(m.models, m.current),
    mode: (m) => CL.composer.setMode(m.value),
    model: (m) => CL.composer.setModel(m.value),
    events: (m) => onEvents(m.events),
    busy(m) {
      setBusy(m.value);
      if (!m.value) CL.composer.sendNextQueued();
    },
    permission: (m) => CL.cards.show(m),
    permissionCancelled: (m) => CL.cards.cancel(m.requestId),
    history: (m) => CL.history.show(m.items, m.currentId),
    sessionLoaded(m) {
      CL.thread.reset();
      CL.claudeTasks.render([]); // the task list is live only, not rebuilt from transcripts
      CL.composer.resetConversation(m.events.filter((ev) => ev.kind === 'user').map((ev) => ev.text));
      CL.history.setCurrent(m.id);
      setTitle(m.title);
      CL.thread.apply(m.events);
      CL.thread.endTurn();
      CL.thread.scrollToBottom();
      CL.composer.focus();
    },
    reset() {
      CL.thread.reset();
      CL.claudeTasks.render([]);
      CL.composer.resetConversation([]);
      setTitle('');
      setBusy(false);
      CL.composer.focus();
    },
    notice: (m) => showNotice(m.text),
    mentionResults: (m) => CL.mentions.setResults(m.items, m.seq),
    insertText: (m) => CL.composer.insertText(m.text),
    planReady() {
      CL.thread.addNode(CL.el('button', { class: 'info-card-btn plan-open', type: 'button', text: 'פתיחת התוכנית בעורך', onclick: () => post({ type: 'planCommand', open: true }) }));
    },
    focus: () => CL.composer.focus(),
    backgroundTasks: (m) => CL.tasksBar.render(m.tasks),
    claudeTasks: (m) => CL.claudeTasks.render(m.tasks),
  };

  window.addEventListener('message', (e) => {
    const handler = e.data && HANDLERS[e.data.type];
    if (handler) handler(e.data);
  });

  document.getElementById('new-btn').addEventListener('click', () => post({ type: 'newConversation' }));

  // Called by the composer when the user sends; the first message titles the header like the tab.
  function userSent(text, imageCount = 0) {
    if (!titled) setTitle(text.replace(/\s+/g, ' ').trim().slice(0, 60));
    CL.thread.addUser(imageCount ? `${text}\n[תמונות: ${imageCount}]` : text);
    CL.thread.scrollToBottom();
    setBusy(true);
  }

  CL.app = { setBusy, userSent, notice: showNotice };
  post({ type: 'ready' });
})();
