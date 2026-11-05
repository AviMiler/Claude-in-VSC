// One conversation = one long-lived CLI process, shown in a webview while it is the visible
// conversation of its place (conversation-host.js); hidden, it keeps running and only records what
// it would have shown (replay-log.js). Holds only in-memory state that dies with the window;
// everything persistent is the CLI's (spec: "the CLI is the only source of truth").
const vscode = require('vscode');
const { CliProcess } = require('../cli/process');
const { mergeEnv } = require('../cli/env');
const { workspaceCwd } = require('../util/workspace');
const { buildArgs } = require('../cli/args');
const { createStreamTranslator } = require('./event-translator');
const replayLog = require('./replay-log');
const transcripts = require('../history/transcripts');
const mentions = require('./mentions');
const { translateTranscript } = require('../history/transcript-events');
const { buildErrorCard } = require('./error-card');
const { launchSettings } = require('../models/launch');
const { isNoVisionError } = require('../models/filter');
const { ModelSwitcher } = require('./model-switch');
const { refreshContextMeter } = require('./context-meter');
const editLog = require('../diff/edit-log');
const { runDiffCommand } = require('../diff/diff-command');
const checkpoints = require('../checkpoints/checkpoints');
const { runRewindMenu } = require('../checkpoints/rewind-menu');
const taskMap = require('../background/task-map');
const claudeTasks = require('../tasks/claude-tasks');
const agentCards = require('../agents/agent-cards');
const loopHost = require('../loop/loop-host');

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const INTERRUPTED = 'Interrupted by the user';
// After the CLI acknowledges an interrupt it should end the turn with a `result`; if none comes
// within this time the turn is closed locally so the stop button never hangs.
const STOP_RESULT_WAIT_MS = 4000;
const TITLE_MAX = 40;
const RENAME_MAX = 100;

function spawnErrorText(err, claudePath) {
  return `לא ניתן להפעיל את Claude (${err.code || err.message}). בדוק את ההגדרה claudeLocal.claudePath (כרגע: ${claudePath}).`;
}

function exitErrorText({ code, stderrTail }) {
  if (/unknown option|error: unknown/i.test(stderrTail)) return 'גרסת Claude Code לא מכירה אחד הדגלים שהתוסף שלח.';
  return `Claude Code נסגר (קוד ${code}).${stderrTail ? `\n${stderrTail.trim()}` : ''}`;
}

let nextId = 1;

class Conversation {
  // webview: optional, attaches at once (tests); a host attaches and detaches it otherwise.
  // isShown: whether the user can see this conversation now (for the "finished unread" marker).
  constructor({ webview, services, onTitle, onActivity, isShown }) {
    this.id = `c${nextId++}`;
    this.webview = webview || null;
    this.services = services;
    this.title = '';
    this.onTitle = onTitle || (() => {});
    // Called after every message to the webview (shown or not), so the drawer and markers can refresh.
    this.onActivity = onActivity || (() => {});
    this.isShown = isShown || (() => Boolean(this.webview));
    this.log = replayLog.createReplayLog();
    this.started = false; // onReady has run (the first attach)
    this.unread = false; // a turn ended while the conversation was not shown
    this.ui = null; // {draft, queue} saved by the webview when the user switched away
    this.loadedFromHistory = false;
    this.activitySig = ''; // busy|waiting|unread at the last onActivity call
    this.proc = null;
    this.sessionId = null;
    this.permissionMode = 'default';
    this.model = 'default';
    this.busy = false;
    this.hasMessages = false;
    this.pending = new Map();
    this.pendingResume = null;
    this.pendingPrefill = null;
    this.webviewReady = false;
    this.pendingRename = null;
    this.stopping = false;
    this.stopTimer = null;
    this.disposed = false;
    this.planText = '';
    this.turnTexts = new Map();
    this.edits = editLog.createEditLog(); // this session's Edit/Write tool calls, for /diff
    this.checkpoints = checkpoints.createCheckpointList(); // prompts sent in this process, for rewind
    this.claudeTasks = claudeTasks.createClaudeTasks(); // Claude's TaskCreate/TaskUpdate list (live only)
    this.agents = agentCards.createAgentCards(); // one card per sub-agent call (live only)
    this.entries = null;
    this.models = new ModelSwitcher(this);
    this.subs = [
      services.settings.onDidChange((s) => {
        this.post({ type: 'settings', settings: this.webviewSettings(s) });
        if (this.proc) this.post({ type: 'notice', text: 'ההגדרה תחול בשיחה הבאה.' });
      }),
    ];
    ({ cwd: this.cwd, noFolder: this.noFolder } = workspaceCwd());
  }

  logLine(text, tag = 'stream', level = 'debug') {
    this.services.logger[level](tag, text);
  }

  setTitle(text) {
    this.title = text && text !== 'Claude' ? text : '';
    this.onTitle(this.title);
  }

  // Recorded for a later redraw, and painted only while a webview is attached. The activity
  // listener only hears about a change of busy / waiting / unread, not about each streamed piece.
  post(msg) {
    if (this.disposed) return;
    replayLog.record(this.log, msg);
    if (this.webview) this.webview.postMessage(msg);
    const sig = `${this.busy}|${this.pending.size}|${this.unread}`;
    if (sig === this.activitySig) return;
    this.activitySig = sig;
    this.onActivity();
  }

  // --- shown / hidden (conversation-host.js) ---------------------------------------------

  attach(webview) {
    this.webview = webview;
    this.unread = false;
    if (!this.started) return this.onReady();
    this.webview.postMessage(this.restoreMessage());
    this.ui = null; // the webview owns the draft and the queue again (no second send)
    this.webviewReady = true;
    this.flushPrefill();
    return this.onActivity();
  }

  // ui: the webview's draft and queued messages for this conversation, given back on the next attach.
  detach(ui) {
    this.webview = null;
    this.webviewReady = false;
    if (ui) this.ui = { draft: String(ui.draft || ''), queue: Array.isArray(ui.queue) ? ui.queue : [] };
  }

  // Everything the webview needs to redraw this conversation after a switch.
  restoreMessage() {
    return {
      type: 'restore',
      id: this.id,
      title: this.title,
      init: this.initMessage(),
      ...replayLog.replay(this.log),
      sent: replayLog.sentTexts(this.log),
      permissions: [...this.pending.values()].map((p) => p.msg),
      busy: this.busy,
      ui: this.ui,
    };
  }

  initMessage() {
    return {
      type: 'init',
      settings: this.webviewSettings(),
      cwd: this.cwd,
      noFolder: this.noFolder,
      permissionMode: this.permissionMode,
    };
  }

  webviewSettings(s = this.services.settings.get()) {
    return {
      useCtrlEnterToSend: s.useCtrlEnterToSend,
      keybindings: s.keybindings,
      display: s.display,
      allowBypass: s.allowDangerouslySkipPermissions,
    };
  }

  // --- lifecycle -------------------------------------------------------------------------

  // The first time the conversation is shown: start the CLI (or resume a past session).
  onReady() {
    this.started = true;
    this.post(this.initMessage());
    if (this.pendingResume) {
      const id = this.pendingResume;
      this.pendingResume = null;
      this.loadSession(id);
    } else if (!this.proc) {
      this.startProcess();
    }
    this.webviewReady = true;
    this.flushPrefill();
  }

  startProcess({ resume, fork = false } = {}) {
    const { claudePath, allowDangerouslySkipPermissions, environmentVariables } = this.services.settings.get();
    const settings = launchSettings({ model: this.model, environmentVariables });
    const args = buildArgs({
      permissionMode: this.permissionMode,
      resume,
      model: this.model !== 'default' ? this.model : undefined,
      allowBypass: allowDangerouslySkipPermissions,
      settings,
    }).concat(checkpoints.checkpointArgs({ fork: fork && Boolean(resume) }));
    this.services.logger.info('spawn', `start ${claudePath} ${args.join(' ')} (cwd ${this.cwd}, resume=${Boolean(resume)}, fork=${fork})`);
    // Its own line: the start line can pass the log's 500-character cut.
    if (settings) this.services.logger.info('spawn', `--settings env ${JSON.stringify(settings.env)}`);
    const proc = new CliProcess({
      claudePath,
      args,
      cwd: this.cwd,
      env: { ...mergeEnv(process.env, environmentVariables), ...checkpoints.CHECKPOINT_ENV },
      log: (t, tag, level) => this.logLine(t, tag, level),
    });
    const translate = createStreamTranslator();
    this.proc = proc;
    // Background tasks live in the CLI process; a new process starts with none.
    const hadTasks = this.tasks && this.tasks.tasks.size > 0;
    this.tasks = taskMap.createTaskMap();
    if (hadTasks) this.post({ type: 'backgroundTasks', tasks: [] });
    loopHost.resetLoop(this);

    proc.on('message', (msg) => {
      if (proc !== this.proc) return;
      checkpoints.addCheckpoint(this.checkpoints, msg);
      loopHost.trackLoop(this, msg);
      if (taskMap.applyMessage(this.tasks, msg)) {
        const tasks = taskMap.backgroundTasks(this.tasks);
        this.services.logger.info('background', `tasks now ${tasks.length}`);
        this.post({ type: 'backgroundTasks', tasks });
      }
      if (claudeTasks.applyMessage(this.claudeTasks, msg)) {
        const list = claudeTasks.listTasks(this.claudeTasks);
        this.services.logger.info('tasks', `list now ${list.length} (done ${list.filter((t) => t.status === 'completed').length})`);
        this.post({ type: 'claudeTasks', tasks: list });
      }
      const events = translate(msg).map((ev) => (ev.kind === 'result' ? this.endTurn(ev) : ev));
      for (const ev of events) {
        if (ev.kind === 'session') {
          this.sessionId = ev.sessionId;
          if (ev.permissionMode) this.permissionMode = ev.permissionMode;
        }
      }
      this.trackPlan(events);
      for (const ev of events) editLog.addEvent(this.edits, ev);
      if (events.length) this.post({ type: 'events', events });
      // After the events, so the Agent tool row the card attaches to already exists.
      agentCards.trackAgents(this, this.agents, msg);
    });
    proc.on('controlRequest', (id, req) => this.onControlRequest(proc, id, req));
    proc.on('controlCancel', (id) => {
      this.pending.delete(id);
      this.post({ type: 'permissionCancelled', requestId: id });
    });
    proc.on('stderr', (d) => this.logLine(`stderr: ${d}`, 'spawn', 'warn'));
    proc.on('exit', (info) => this.onExit(proc, info, claudePath));

    proc.request('initialize', {}, 60000).then(
      (info) => {
        if (proc !== this.proc) return;
        this.initInfo = info;
        this.postInitInfo(info);
        // `auto` is not a launch flag value we rely on; re-apply it with the verified control request.
        if (this.permissionMode === 'auto') this.setMode('auto');
        refreshContextMeter(this);
      },
      (err) => this.services.logger.warn('control', `initialize failed: ${err.message}`),
    );
    return proc;
  }

  postInitInfo(info) {
    this.post({ type: 'commands', commands: info.commands || [] });
    this.models.postList();
  }

  // A turn's result; when the user pressed stop it is shown as "stopped", not as an error.
  endTurn(rawEv) {
    let ev = rawEv;
    if (ev.kind === 'result' && ev.isError && isNoVisionError(ev.errorText)) {
      ev = { ...ev, errorText: `המודל הנוכחי כנראה לא תומך בתמונות. החליפו למודל עם תמיכה בתמונות או שלחו בלי תמונה.\n${ev.errorText}` };
    }
    const stopped = this.stopping;
    this.busy = false;
    this.stopping = false;
    clearTimeout(this.stopTimer);
    this.models.onTurnEnd(ev);
    if (ev.kind === 'result') {
      setImmediate(() => refreshContextMeter(this));
      if (!this.isShown()) this.unread = true;
      if (!this.webview && this.ui && this.ui.queue.length) setImmediate(() => this.sendQueuedHidden());
    }
    return stopped ? { ...ev, isError: false, errorText: '', interrupted: true } : ev;
  }

  onExit(proc, info, claudePath) {
    if (proc !== this.proc) return;
    this.proc = null;
    this.denyAllPending();
    loopHost.resetLoop(this); // the jobs died with the process
    const wasBusy = this.busy && !this.stopping;
    this.endTurn({});
    if (this.disposed) return;
    this.services.logger.info('spawn', `exit code=${info.code} signal=${info.signal || ''}${info.error ? ` error=${info.error.code || info.error.message}` : ''}`);
    let text = null;
    if (info.error) text = spawnErrorText(info.error, claudePath);
    else if (info.code !== 0 && info.code !== null) text = exitErrorText(info);
    else if (wasBusy) text = 'Claude Code נסגר באמצע תשובה.';
    // The error result already ends the turn in the webview; a second `busy:false` would race with a queued send.
    if (text) {
      this.post({ type: 'events', events: [{ kind: 'result', isError: true, errorText: text }] });
      const env = mergeEnv(process.env, this.services.settings.get().environmentVariables);
      const card = buildErrorCard({ claudePath, env });
      this.services.logger.info('error-card', `shown for claudePath=${claudePath} (code=${info.code})`);
      this.post({ type: 'errorCard', card });
    } else this.post({ type: 'busy', value: false });
  }

  killProcess() {
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;
    this.denyAllPending(proc);
    proc.kill();
  }

  // --- webview requests ------------------------------------------------------------------

  // hidden: a prompt the extension sends for the user (the /loop stop text), drawn as no bubble.
  send(text, images, { hidden = false } = {}) {
    if (!text || !text.trim() || this.busy) return;
    const valid = Array.isArray(images)
      ? images.filter((i) => i && IMAGE_TYPES.includes(i.mediaType) && typeof i.data === 'string')
      : [];
    if (!this.proc) this.startProcess({ resume: this.sessionId || undefined });
    if (!this.hasMessages) this.setTitle(text.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX));
    this.hasMessages = true;
    this.services.logger.info('stream', `send (${text.length} chars, ${valid.length} images, session=${this.sessionId || 'new'})`);
    this.busy = true;
    if (!hidden) replayLog.addUser(this.log, valid.length ? `${text}\n[תמונות: ${valid.length}]` : text);
    this.proc.sendUserText(text, valid);
  }

  // The client-side queue of a conversation the user switched away from: the host keeps it and
  // sends the next item when the turn ends, so a hidden conversation does not stall.
  sendQueuedHidden() {
    if (this.busy || this.webview || this.disposed || !this.ui || !this.ui.queue.length) return;
    const item = this.ui.queue.shift();
    this.services.logger.info('queue', `send next queued (hidden conversation ${this.id}, ${this.ui.queue.length} left)`);
    this.send(String(item.text || ''), item.images);
  }

  interrupt() {
    if (!this.proc || !this.busy || this.stopping) return;
    const proc = this.proc;
    this.services.logger.info('stream', 'interrupt (stop pressed)');
    this.stopping = true;
    this.denyAllPending();
    proc.stop().then(() => {
      clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(() => {
        if (proc !== this.proc || !this.stopping) return;
        this.forcedEndAt = Date.now(); // late lines of this turn must not look self-started (loop-host.js)
        this.post({ type: 'events', events: [this.endTurn({ kind: 'result' })] });
      }, STOP_RESULT_WAIT_MS);
    });
  }

  notifyFailure(what, err) {
    this.services.logger.warn('control', `${what} failed: ${err.message}`);
    this.post({ type: 'notice', text: `ה-CLI סירב: ${err.message}` });
  }

  setMode(value) {
    if (this.busy) {
      this.post({ type: 'notice', text: 'לא ניתן להחליף מצב הרשאות בזמן ש-Claude עובד.' });
      return this.post({ type: 'mode', value: this.permissionMode });
    }
    const previous = this.permissionMode;
    this.services.logger.info('session', `set mode ${previous} -> ${value}`);
    this.permissionMode = value;
    if (!this.proc) return this.post({ type: 'mode', value });
    this.proc.request('set_permission_mode', { mode: value }, 10000).then(
      () => this.post({ type: 'mode', value }),
      (err) => {
        this.notifyFailure('set_permission_mode', err);
        this.permissionMode = previous;
        this.post({ type: 'mode', value: previous });
      },
    );
  }

  // A model switch restarts the CLI (model-switch.js).
  setModel(value) {
    this.models.switchTo(value);
  }

  stopAndSwitchModel(value) {
    this.models.stopAndSwitch(value);
  }

  onControlRequest(proc, id, req) {
    if (req.subtype !== 'can_use_tool') {
      proc.respondError(id, `unsupported request: ${req.subtype}`);
      return;
    }
    const msg = {
      type: 'permission',
      requestId: id,
      tool: req.tool_name,
      input: req.input || {},
      toolUseId: req.tool_use_id,
      suggestions: Array.isArray(req.permission_suggestions) && req.permission_suggestions.length > 0,
      reason: req.decision_reason || req.title || '',
    };
    // Kept with the request: a hidden conversation's card is drawn when the user switches to it.
    this.pending.set(id, { proc, req, msg });
    this.services.logger.info('permission', `request ${id} tool=${req.tool_name}${this.webview ? '' : ` (conversation ${this.id} is hidden)`}`);
    this.post(msg);
  }

  answerPermission({ requestId, behavior, always, message, updatedInput }) {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);
    const { proc, req } = entry;
    this.services.logger.info('permission', `answer ${requestId} ${behavior === 'allow' ? 'allow' : 'deny'}${always ? ' (always)' : ''}`);
    if (behavior === 'allow') {
      const response = { behavior: 'allow', updatedInput: updatedInput || req.input || {} };
      if (always && req.permission_suggestions) response.updatedPermissions = req.permission_suggestions;
      proc.respond(requestId, response);
    } else {
      proc.respond(requestId, { behavior: 'deny', message: message || 'המשתמש דחה את הבקשה.' });
    }
  }

  denyAllPending(onlyProc) {
    for (const [id, { proc }] of this.pending) {
      if (onlyProc && proc !== onlyProc) continue;
      this.services.logger.info('permission', `auto-deny ${id} (interrupted)`);
      proc.respond(id, { behavior: 'deny', message: INTERRUPTED, interrupt: true });
      this.pending.delete(id);
      this.post({ type: 'permissionCancelled', requestId: id });
    }
  }

  // True while nothing was sent: a past conversation can be loaded into it instead of a new one.
  isEmpty() {
    return !this.hasMessages && !this.busy && !this.loadedFromHistory && this.pending.size === 0;
  }

  loadSession(id) {
    this.loadedFromHistory = true;
    this.services.logger.info('session', `load ${id}`);
    let events = [];
    let title = '';
    try {
      events = translateTranscript(transcripts.readSession(this.cwd, id));
      title = transcripts.sessionTitle(this.cwd, id);
    } catch (err) {
      this.services.logger.warn('session', `readSession failed: ${err.message}`);
      this.post({ type: 'events', events: [{ kind: 'result', isError: true, errorText: 'לא ניתן לקרוא את השיחה מקובצי ה-CLI.' }] });
      return;
    }
    this.killProcess();
    this.sessionId = id;
    this.hasMessages = events.length > 0;
    this.edits = editLog.createEditLog();
    for (const ev of events) editLog.addEvent(this.edits, ev);
    this.checkpoints = checkpoints.createCheckpointList();
    this.claudeTasks = claudeTasks.createClaudeTasks();
    this.agents = agentCards.createAgentCards();
    if (title) this.setTitle(title.slice(0, TITLE_MAX));
    this.post({ type: 'sessionLoaded', id, title, events });
    this.startProcess({ resume: id });
    if (this.pendingRename) {
      const title = this.pendingRename;
      this.pendingRename = null;
      this.renameSession(title);
    }
  }

  // Rename goes through the CLI's own /rename (it writes `custom-title` to the transcript);
  // the extension never writes the file itself.
  renameSession(rawTitle) {
    const title = String(rawTitle || '').replace(/\s+/g, ' ').trim().slice(0, RENAME_MAX);
    if (!title || !this.sessionId) return false;
    if (this.busy) {
      this.post({ type: 'notice', text: 'לא ניתן לשנות שם בזמן ש-Claude עובד. נסו שוב בסיום.' });
      return false;
    }
    if (!this.proc) this.startProcess({ resume: this.sessionId });
    this.busy = true;
    this.post({ type: 'busy', value: true });
    this.setTitle(title.slice(0, TITLE_MAX));
    this.services.logger.info('history', `rename session ${this.sessionId} (${title.length} chars)`);
    this.proc.sendUserText(`/rename ${title}`, []);
    return true;
  }

  openFile(filePath, line) {
    const uri = vscode.Uri.file(filePath);
    const options = {};
    if (Number.isInteger(line) && line > 0) options.selection = new vscode.Range(line - 1, 0, line - 1, 0);
    vscode.window.showTextDocument(uri, options).then(undefined, () => {
      vscode.window.showWarningMessage(`לא ניתן לפתוח את ${filePath}`);
    });
  }

  // The plan is the assistant's text of the turn that ends in ExitPlanMode (its `input.plan` arrives empty).
  trackPlan(events) {
    for (const ev of events) {
      if (ev.kind === 'block' && ev.blockType === 'text') this.turnTexts.set(ev.key, ev.text);
      else if (ev.kind === 'tool' && ev.name === 'ExitPlanMode') {
        const text = [...this.turnTexts.values()].join('\n\n').trim();
        if (text) {
          this.planText = text;
          this.post({ type: 'planReady' });
        }
      } else if (ev.kind === 'result') this.turnTexts.clear();
    }
  }

  // `/plan` switches to plan mode; `/plan open` shows the last plan as a read-only document.
  planCommand(open) {
    if (!open) {
      this.services.logger.info('session', `/plan (mode ${this.permissionMode}, busy ${Boolean(this.busy)})`);
      if (this.busy) return this.setMode('plan'); // setMode explains the refusal
      if (this.permissionMode === 'plan') return this.post({ type: 'notice', text: 'כבר במצב תכנון. בקשו מ-Claude תוכנית; /plan open יפתח אותה בעורך.' });
      this.post({ type: 'notice', text: 'עברתם למצב תכנון: Claude יתכנן בלי לשנות קבצים.' });
      return this.setMode('plan');
    }
    if (!this.planText) return this.post({ type: 'notice', text: 'עדיין אין תוכנית לפתיחה. עברו למצב תכנון ובקשו מ-Claude תוכנית.' });
    return this.services.planDocs.open(this.planText);
  }

  // `/diff`: the files this session's Edit/Write tool calls changed (no git).
  async diffCommand() {
    this.services.logger.info('diff', 'command');
    const shown = await runDiffCommand(this.edits, this.services.diffView, this.cwd, this.services.logger);
    if (!shown) this.post({ type: 'notice', text: 'Claude עוד לא שינה קבצים בשיחה הזו.' });
  }

  // The stop button of a background task: `stop_task {task_id}` (probe4); the CLI then reports
  // the task as stopped through the usual system lines.
  stopTask(id) {
    if (!this.proc || !id) return;
    this.services.logger.info('background', `stop_task ${id}`);
    this.proc.request('stop_task', { task_id: id }, 10000).catch((err) => this.notifyFailure('stop_task', err));
  }

  // The stop button of the /loop bar (src/loop/loop-host.js).
  stopLoop(id) {
    return loopHost.stopLoop(this, id);
  }

  // Esc Esc / the rewind shortcut: the checkpoints menu (src/checkpoints/rewind-menu.js).
  rewindMenu() {
    this.services.logger.info('checkpoint', `rewind menu (${this.checkpoints.items.length} checkpoints)`);
    return runRewindMenu(this);
  }

  // Fork: restart with --resume <id> --fork-session; the CLI gives a new session id with the same
  // context and the original transcript stays as it was. The thread on screen is kept.
  forkSession() {
    if (!this.sessionId || this.busy) return this.post({ type: 'notice', text: 'אפשר לפצל רק שיחה קיימת, כש-Claude לא עובד.' });
    this.services.logger.info('checkpoint', `fork session ${this.sessionId}`);
    this.killProcess();
    // Whether the forked process accepts the old prompts' uuids is unverified, so they are dropped.
    this.checkpoints = checkpoints.createCheckpointList();
    this.startProcess({ resume: this.sessionId, fork: true });
    return this.post({ type: 'notice', text: 'השיחה פוצלה: ההמשך נשמר כשיחה חדשה, והמקורית נשארת כמו שהיא.' });
  }

  async mentionSearch(query, seq) {
    const now = Date.now();
    if (!this.entries || now - this.entriesAt > 10000) {
      try {
        this.entries = await mentions.listEntries(this.cwd, this.services.settings.get().respectGitIgnore);
        this.entriesAt = now;
      } catch (err) {
        this.services.logger.warn('control', `mention listing failed: ${err.message}`);
        this.entries = [];
      }
    }
    const rel = mentions.relativeQuery(this.cwd, query);
    this.post({ type: 'mentionResults', seq, items: mentions.rankPaths(this.entries, rel, 30, this.cwd) });
  }

  // Files dragged in with Shift arrive as URIs and become @path mentions (a PDF is read by the CLI itself).
  dropUris(uris) {
    const parts = [];
    for (const raw of Array.isArray(uris) ? uris.slice(0, 20) : []) {
      let uri;
      try {
        uri = vscode.Uri.parse(String(raw));
      } catch {
        continue;
      }
      if (uri.scheme !== 'file') continue;
      parts.push(mentions.mentionText(mentions.toSlashes(uri.fsPath)));
    }
    if (parts.length) this.insertText(`${parts.join(' ')} `);
  }

  // Text from a URI link: placed in the box once the webview is ready; never sent.
  prefill(text) {
    this.pendingPrefill = text;
    if (this.webviewReady) this.flushPrefill();
  }

  flushPrefill() {
    if (!this.pendingPrefill) return;
    const text = this.pendingPrefill;
    this.pendingPrefill = null;
    this.insertText(text);
  }

  insertText(text) {
    this.post({ type: 'insertText', text });
    this.post({ type: 'focus' });
  }

  openTerminal() {
    vscode.commands.executeCommand('claude-local.terminal.open');
  }

  openLink(url) {
    if (/^https?:\/\//i.test(url)) vscode.env.openExternal(vscode.Uri.parse(url));
  }

  focusInput() {
    this.post({ type: 'focus' });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.stopTimer);
    this.killProcess();
    for (const s of this.subs) s.dispose();
  }
}

module.exports = { Conversation };
