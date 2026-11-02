// Bootstraps the chat webview and dispatches host -> webview messages. The webview shows one
// conversation at a time; `restore` redraws another one after a switch (restore.js).
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
  const UNTITLED = 'שיחה חדשה';
  let verbTimer = 0;
  let statusVerb = null;
  let noticeTimer = 0;

  function setVerb() {
    const verb = statusVerb || CL.display.verb(VERBS);
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
    headerTitle.textContent = text || UNTITLED;
    headerTitle.title = text || '';
  }

  function showNotice(text) {
    notice.textContent = text;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 6000);
  }

  function onEvents(events) {
    for (const ev of events) {
      if (ev.kind === 'session') {
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

  // Everything one conversation drew; called before another conversation is drawn.
  function resetView() {
    CL.thread.reset();
    CL.claudeTasks.render([]);
    CL.tasksBar.render([]);
    CL.loopBar.render([]);
    CL.agentCards.reset();
    CL.contextMeter.set(null, null);
    CL.menu.close();
    CL.slashMenu.close();
    CL.mentions.close();
    CL.mcp.close();
    notice.hidden = true;
    setTitle('');
    setBusy(false);
  }

  const HANDLERS = {
    init(m) {
      CL.tools.setCwd(m.cwd);
      CL.composer.setSettings(m.settings);
      CL.display.apply(m.settings.display);
      CL.composer.setMode(m.permissionMode);
      CL.composer.setNoFolder(m.noFolder);
      CL.composer.focus();
    },
    settings(m) {
      CL.composer.setSettings(m.settings);
      CL.display.apply(m.settings.display);
    },
    commands: (m) => CL.slashMenu.setCommands(m.commands),
    models: (m) => CL.composer.setModels(m.models, m.current),
    mode: (m) => CL.composer.setMode(m.value),
    model: (m) => CL.composer.setModel(m.value),
    context: (m) => CL.contextMeter.set(m.used, m.max),
    events: (m) => onEvents(m.events),
    busy(m) {
      setBusy(m.value);
      if (!m.value) CL.composer.sendNextQueued();
    },
    permission: (m) => CL.cards.show(m),
    permissionCancelled: (m) => CL.cards.cancel(m.requestId),
    sessionLoaded(m) {
      CL.thread.reset();
      CL.claudeTasks.render([]); // the task list is live only, not rebuilt from transcripts
      CL.agentCards.reset(); // so are agent cards
      CL.composer.resetConversation(m.events.filter((ev) => ev.kind === 'user').map((ev) => ev.text));
      setTitle(m.title);
      CL.thread.apply(m.events);
      CL.thread.endTurn();
      CL.thread.scrollToBottom();
      CL.composer.focus();
    },
    // Another conversation of this place is shown (drawer, "new conversation", history).
    restore(m) {
      CL.restore.restore(m, { reset: resetView, dispatch, setTitle, setBusy });
    },
    conversations: (m) => CL.drawer.setList(m),
    conversationStates: (m) => CL.drawer.setStates(m),
    title: (m) => setTitle(m.text),
    notice: (m) => showNotice(m.text),
    mentionResults: (m) => CL.mentions.setResults(m.items, m.seq),
    insertText: (m) => CL.composer.insertText(m.text),
    planReady() {
      CL.thread.addNode(CL.el('button', { class: 'info-card-btn plan-open', type: 'button', text: 'פתיחת התוכנית בעורך', onclick: () => post({ type: 'planCommand', open: true }) }));
    },
    focus: () => CL.composer.focus(),
    mcpState: (m) => CL.mcp.setState(m),
    mcpResult: (m) => CL.mcp.setResult(m),
    errorCard: (m) => CL.errorCard.show(m.card),
    backgroundTasks: (m) => CL.tasksBar.render(m.tasks),
    claudeTasks: (m) => CL.claudeTasks.render(m.tasks),
    agentCards: (m) => CL.agentCards.render(m.cards),
    loopJobs: (m) => CL.loopBar.render(m.jobs),
    // A turn the CLI started by itself (a /loop job); unverified sequence, see src/loop/self-turn.js.
    selfTurn() {
      CL.thread.endTurn();
      CL.thread.addNode(CL.el('div', { class: 'result-line', text: '⏰ Claude התחיל תור בעצמו (למשל משימה מתוזמנת של /loop)' }));
      setBusy(true);
    },
  };

  function dispatch(msg) {
    const handler = msg && HANDLERS[msg.type];
    if (handler) handler(msg);
  }

  window.addEventListener('message', (e) => dispatch(e.data));

  // A new conversation never stops the visible one: the host keeps it running hidden.
  function newConversation() {
    post({ type: 'newConversation', ui: CL.composer.uiState() });
  }
  document.getElementById('new-btn').addEventListener('click', newConversation);

  // Ctrl+Esc ("focus toggle") needs to know whether this view has the keyboard focus.
  window.addEventListener('focus', () => post({ type: 'viewFocus', on: true }));
  window.addEventListener('blur', () => post({ type: 'viewFocus', on: false }));

  // Called by the composer when the user sends; the first message titles the header like the tab.
  function userSent(text, imageCount = 0) {
    if (!titled) setTitle(text.replace(/\s+/g, ' ').trim().slice(0, 60));
    CL.thread.addUser(imageCount ? `${text}\n[תמונות: ${imageCount}]` : text);
    if (CL.display.scrollOnSend()) CL.thread.scrollToBottom();
    setBusy(true);
  }

  CL.app = { setBusy, userSent, notice: showNotice, newConversation };
  post({ type: 'ready' });
})();
