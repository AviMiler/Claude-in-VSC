// The Activity Bar list of previous conversations (read-only from the CLI's transcripts), with
// in-memory filters, rename through the CLI, "reopen closed" and the "continue last" suggestion.
const vscode = require('vscode');
const transcripts = require('../history/transcripts');
const { workspaceCwd } = require('../util/workspace');
const { openChatPanel } = require('./chat-panel');
const { FILTERS, classify, filterItems, continueSuggestion } = require('./session-model');

const VIEW_ID = 'claudeLocalHistory';
const FILTER_LABELS = { all: 'הכול', active: 'פעילות', waiting: 'ממתינות לאישור', finished: 'הסתיימו' };
const STATUS_LABELS = { active: 'פעילה', waiting: 'ממתינה לאישור', finished: 'הסתיימה' };
const STATUS_ICONS = {
  active: new vscode.ThemeIcon('sync~spin'),
  waiting: new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.blue')),
  finished: new vscode.ThemeIcon('comment'),
};

function ago(mtime) {
  const mins = Math.max(0, Math.round((Date.now() - mtime) / 60000));
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `לפני ${hours} שע׳`;
  return new Date(mtime).toLocaleDateString('he-IL');
}

function registerHistory(context, services) {
  const { registry, logger } = services;
  let filter = 'all'; // temporary: dies with the window
  const emitter = new vscode.EventEmitter();
  context.subscriptions.push(emitter);

  function load() {
    try {
      return transcripts.listSessions(workspaceCwd().cwd);
    } catch (err) {
      logger.warn(`history list failed: ${err.message}`);
      return [];
    }
  }

  const provider = {
    onDidChangeTreeData: emitter.event,
    getTreeItem: (node) => node,
    getChildren() {
      const items = load();
      const open = registry.openStates();
      const rows = [];
      const suggestion = filter === 'all' ? continueSuggestion(items, open) : null;
      if (suggestion) {
        const node = new vscode.TreeItem(`המשך את השיחה האחרונה: ${suggestion.title}`);
        node.iconPath = new vscode.ThemeIcon('debug-continue');
        node.command = { command: 'claude-local.history.open', title: 'המשך', arguments: [suggestion.id] };
        rows.push(node);
      }
      for (const s of filterItems(classify(items, open), filter)) {
        const node = new vscode.TreeItem(s.title);
        node.description = `${STATUS_LABELS[s.status]} · ${ago(s.mtime)}`;
        node.iconPath = STATUS_ICONS[s.status];
        node.contextValue = 'session';
        node.sessionId = s.id;
        node.sessionTitle = s.title;
        node.command = { command: 'claude-local.history.open', title: 'פתיחה', arguments: [s.id] };
        rows.push(node);
      }
      return rows;
    },
  };

  const view = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: provider });
  context.subscriptions.push(view);
  const refresh = () => emitter.fire();
  const setClosedContext = () => vscode.commands.executeCommand('setContext', 'claude-local:hasClosed', registry.hasClosed());
  context.subscriptions.push(
    registry.onChange(() => { refresh(); setClosedContext(); }),
    view.onDidChangeVisibility((e) => { if (e.visible) refresh(); }),
  );
  setClosedContext();

  function open(id, rename) {
    const existing = registry.findBySession(id);
    if (existing) {
      existing.reveal();
      if (rename) existing.conversation.renameSession(rename);
      return;
    }
    const entry = openChatPanel(services, { resume: id });
    if (rename) entry.conversation.pendingRename = rename;
  }

  const commands = {
    'claude-local.history.open': (id) => open(String(id)),
    'claude-local.history.refresh': refresh,
    'claude-local.history.filter': async () => {
      const picks = FILTERS.map((f) => ({ label: FILTER_LABELS[f], description: f === filter ? '✓' : '', value: f }));
      const picked = await vscode.window.showQuickPick(picks, { placeHolder: 'סינון שיחות (זמני, לא נשמר)' });
      if (picked) {
        filter = picked.value;
        view.description = filter === 'all' ? undefined : FILTER_LABELS[filter];
        refresh();
      }
    },
    'claude-local.history.rename': async (node) => {
      if (!node || !node.sessionId) return;
      const title = await vscode.window.showInputBox({ prompt: 'שם חדש לשיחה (נשלח ל-CLI כ-/rename)', value: node.sessionTitle });
      if (title && title.trim()) open(node.sessionId, title.trim());
    },
    'claude-local.reopenClosed': () => {
      const id = registry.popClosed();
      if (id) open(id);
      else vscode.window.showInformationMessage('אין שיחה סגורה לפתיחה מחדש.');
      setClosedContext();
    },
    'claude-local.continueLast': () => {
      const first = load()[0];
      if (first) open(first.id);
      else vscode.window.showInformationMessage('אין שיחות קודמות להמשך.');
    },
  };
  for (const [id, fn] of Object.entries(commands)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  }
}

module.exports = { registerHistory, VIEW_ID };
