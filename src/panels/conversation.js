// One conversation = one webview + one long-lived CLI process. Holds only in-memory state that
// dies with the window; everything persistent is the CLI's (spec: "the CLI is the only source
// of truth").
const os = require('os');
const vscode = require('vscode');
const { CliProcess } = require('../cli/process');
const { buildArgs } = require('../cli/args');
const { createStreamTranslator } = require('./event-translator');
const { routeMessage } = require('./message-router');
const transcripts = require('../history/transcripts');
const { translateTranscript } = require('../history/transcript-events');

const INTERRUPTED = 'Interrupted by the user';
// After the CLI acknowledges an interrupt it should end the turn with a `result`; if none comes
// within this time the turn is closed locally so the stop button never hangs.
const STOP_RESULT_WAIT_MS = 4000;
const TITLE_MAX = 40;

function workspaceCwd() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length ? { cwd: folders[0].uri.fsPath, noFolder: false } : { cwd: os.homedir(), noFolder: true };
}

function spawnErrorText(err, claudePath) {
  return `לא ניתן להפעיל את Claude (${err.code || err.message}). בדוק את ההגדרה claudeLocal.claudePath (כרגע: ${claudePath}).`;
}

function exitErrorText({ code, stderrTail }) {
  if (/unknown option|error: unknown/i.test(stderrTail)) return 'גרסת Claude Code לא מכירה אחד הדגלים שהתוסף שלח.';
  return `Claude Code נסגר (קוד ${code}).${stderrTail ? `\n${stderrTail.trim()}` : ''}`;
}

class Conversation {
  constructor({ webview, services, setTitle, openInNewTab }) {
    this.webview = webview;
    this.services = services;
    this.setTitle = setTitle || (() => {});
    this.openInNewTab = openInNewTab;
    this.proc = null;
    this.sessionId = null;
    this.permissionMode = 'default';
    this.model = 'default';
    this.busy = false;
    this.hasMessages = false;
    this.pending = new Map();
    this.pendingResume = null;
    this.stopping = false;
    this.stopTimer = null;
    this.disposed = false;
    this.subs = [
      webview.onDidReceiveMessage((msg) => routeMessage(this, msg)),
      services.settings.onDidChange((s) => {
        this.post({ type: 'settings', settings: this.webviewSettings(s) });
        if (this.proc) this.post({ type: 'notice', text: 'ההגדרה תחול בשיחה הבאה.' });
      }),
    ];
    ({ cwd: this.cwd, noFolder: this.noFolder } = workspaceCwd());
  }

  log(text) {
    this.services.logger.debug(text);
  }

  post(msg) {
    if (!this.disposed) this.webview.postMessage(msg);
  }

  webviewSettings(s = this.services.settings.get()) {
    return { useCtrlEnterToSend: s.useCtrlEnterToSend, allowBypass: s.allowDangerouslySkipPermissions };
  }

  // --- lifecycle -------------------------------------------------------------------------

  onReady() {
    this.post({
      type: 'init',
      settings: this.webviewSettings(),
      cwd: this.cwd,
      noFolder: this.noFolder,
      permissionMode: this.permissionMode,
    });
    if (this.pendingResume) {
      const id = this.pendingResume;
      this.pendingResume = null;
      this.loadSession(id);
    } else if (!this.proc) {
      this.startProcess();
    } else if (this.initInfo) {
      this.postInitInfo(this.initInfo);
    }
  }

  startProcess({ resume } = {}) {
    const { claudePath, allowDangerouslySkipPermissions } = this.services.settings.get();
    const args = buildArgs({
      permissionMode: this.permissionMode,
      resume,
      model: this.model !== 'default' ? this.model : undefined,
      allowBypass: allowDangerouslySkipPermissions,
    });
    this.services.logger.info(`spawn ${claudePath} ${args.join(' ')} (cwd ${this.cwd})`);
    const proc = new CliProcess({ claudePath, args, cwd: this.cwd, log: (t) => this.log(t) });
    const translate = createStreamTranslator();
    this.proc = proc;

    proc.on('message', (msg) => {
      if (proc !== this.proc) return;
      const events = translate(msg).map((ev) => (ev.kind === 'result' ? this.endTurn(ev) : ev));
      for (const ev of events) {
        if (ev.kind === 'session') {
          this.sessionId = ev.sessionId;
          if (ev.permissionMode) this.permissionMode = ev.permissionMode;
        }
      }
      if (events.length) this.post({ type: 'events', events });
    });
    proc.on('controlRequest', (id, req) => this.onControlRequest(proc, id, req));
    proc.on('controlCancel', (id) => {
      this.pending.delete(id);
      this.post({ type: 'permissionCancelled', requestId: id });
    });
    proc.on('stderr', (d) => this.log(`stderr: ${d}`));
    proc.on('exit', (info) => this.onExit(proc, info, claudePath));

    proc.request('initialize', {}, 60000).then(
      (info) => {
        if (proc !== this.proc) return;
        this.initInfo = info;
        this.postInitInfo(info);
      },
      (err) => this.services.logger.warn(`initialize failed: ${err.message}`),
    );
    return proc;
  }

  postInitInfo(info) {
    this.post({ type: 'commands', commands: info.commands || [] });
    this.post({ type: 'models', models: info.models || [], current: this.model });
  }

  // A turn's result; when the user pressed stop it is shown as "stopped", not as an error.
  endTurn(ev) {
    const stopped = this.stopping;
    this.busy = false;
    this.stopping = false;
    clearTimeout(this.stopTimer);
    return stopped ? { ...ev, isError: false, errorText: '', interrupted: true } : ev;
  }

  onExit(proc, info, claudePath) {
    if (proc !== this.proc) return;
    this.proc = null;
    this.denyAllPending();
    const wasBusy = this.busy && !this.stopping;
    this.endTurn({});
    if (this.disposed) return;
    this.services.logger.info(`process exited code=${info.code} signal=${info.signal || ''}`);
    let text = null;
    if (info.error) text = spawnErrorText(info.error, claudePath);
    else if (info.code !== 0 && info.code !== null) text = exitErrorText(info);
    else if (wasBusy) text = 'Claude Code נסגר באמצע תשובה.';
    if (text) this.post({ type: 'events', events: [{ kind: 'result', isError: true, errorText: text }] });
    this.post({ type: 'busy', value: false });
  }

  killProcess() {
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;
    this.denyAllPending(proc);
    proc.kill();
  }

  // --- webview requests ------------------------------------------------------------------

  send(text) {
    if (!text || !text.trim() || this.busy) return;
    if (!this.proc) this.startProcess({ resume: this.sessionId || undefined });
    if (!this.hasMessages) this.setTitle(text.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX));
    this.hasMessages = true;
    this.busy = true;
    this.proc.sendUserText(text);
  }

  interrupt() {
    if (!this.proc || !this.busy || this.stopping) return;
    const proc = this.proc;
    this.stopping = true;
    this.denyAllPending();
    proc.stop().then(() => {
      clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(() => {
        if (proc !== this.proc || !this.stopping) return;
        this.post({ type: 'events', events: [this.endTurn({ kind: 'result' })] });
      }, STOP_RESULT_WAIT_MS);
    });
  }

  notifyFailure(what, err) {
    this.services.logger.warn(`${what} failed: ${err.message}`);
    this.post({ type: 'notice', text: `ה-CLI סירב: ${err.message}` });
  }

  setMode(value) {
    const previous = this.permissionMode;
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

  setModel(value) {
    const previous = this.model;
    this.model = value;
    if (!this.proc) return this.post({ type: 'model', value });
    this.proc.request('set_model', { model: value }, 10000).then(
      () => this.post({ type: 'model', value }),
      (err) => {
        this.notifyFailure('set_model', err);
        this.model = previous;
        this.post({ type: 'model', value: previous });
      },
    );
  }

  onControlRequest(proc, id, req) {
    if (req.subtype !== 'can_use_tool') {
      proc.respondError(id, `unsupported request: ${req.subtype}`);
      return;
    }
    this.pending.set(id, { proc, req });
    this.post({
      type: 'permission',
      requestId: id,
      tool: req.tool_name,
      input: req.input || {},
      toolUseId: req.tool_use_id,
      suggestions: Array.isArray(req.permission_suggestions) && req.permission_suggestions.length > 0,
      reason: req.decision_reason || req.title || '',
    });
  }

  answerPermission({ requestId, behavior, always, message, updatedInput }) {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);
    const { proc, req } = entry;
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
      proc.respond(id, { behavior: 'deny', message: INTERRUPTED, interrupt: true });
      this.pending.delete(id);
      this.post({ type: 'permissionCancelled', requestId: id });
    }
  }

  listHistory() {
    let items = [];
    try {
      items = transcripts.listSessions(this.cwd);
    } catch (err) {
      this.services.logger.warn(`listSessions failed: ${err.message}`);
    }
    this.post({ type: 'history', items, currentId: this.sessionId });
  }

  openSession(id) {
    const open = this.services.registry.findBySession(id);
    if (open) return open.reveal();
    if (this.hasMessages || this.busy) return this.openInNewTab(id);
    this.loadSession(id);
  }

  loadSession(id) {
    let events = [];
    let title = '';
    try {
      events = translateTranscript(transcripts.readSession(this.cwd, id));
      title = transcripts.sessionTitle(this.cwd, id);
    } catch (err) {
      this.services.logger.warn(`readSession failed: ${err.message}`);
      this.post({ type: 'events', events: [{ kind: 'result', isError: true, errorText: 'לא ניתן לקרוא את השיחה מקובצי ה-CLI.' }] });
      return;
    }
    this.killProcess();
    this.sessionId = id;
    this.hasMessages = events.length > 0;
    if (title) this.setTitle(title.slice(0, TITLE_MAX));
    this.post({ type: 'sessionLoaded', id, title, events });
    this.startProcess({ resume: id });
  }

  newConversation() {
    if (this.busy) return;
    this.killProcess();
    this.sessionId = null;
    this.hasMessages = false;
    this.setTitle('Claude');
    this.post({ type: 'reset' });
    this.startProcess();
  }

  openFile(filePath, line) {
    const uri = vscode.Uri.file(filePath);
    const options = {};
    if (Number.isInteger(line) && line > 0) options.selection = new vscode.Range(line - 1, 0, line - 1, 0);
    vscode.window.showTextDocument(uri, options).then(undefined, () => {
      vscode.window.showWarningMessage(`לא ניתן לפתוח את ${filePath}`);
    });
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
