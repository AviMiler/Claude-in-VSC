// A conversation in an editor tab (WebviewPanel "claudeLocalPanel").
const vscode = require('vscode');
const { Conversation } = require('./conversation');
const { chatHtml, webviewOptions } = require('./webview-html');
const { createTabTracker, decorateTitle } = require('./session-model');

const VIEW_TYPE = 'claudeLocalPanel';

function openChatPanel(services, { resume } = {}) {
  const { extensionUri, registry } = services;
  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    'Claude',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    { ...webviewOptions(extensionUri), retainContextWhenHidden: true },
  );
  panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'claude-logo.svg');

  // The tab title carries the colour-dot marker (blue = waiting for permission, orange = finished
  // while the tab was hidden); VS Code has no colour API for tabs.
  let entry = null;
  const tracker = createTabTracker();
  let baseTitle = 'Claude';
  let state = null;
  const applyTitle = () => { panel.title = decorateTitle(baseTitle, state); };
  const refreshState = () => {
    const c = entry.conversation;
    const next = tracker.update({ busy: c.busy, waiting: c.pending.size > 0, visible: panel.visible });
    if (next !== state) {
      state = next;
      applyTitle();
    }
    services.registry.changed();
  };

  const conversation = new Conversation({
    webview: panel.webview,
    services,
    setTitle: (t) => { baseTitle = t || 'Claude'; applyTitle(); },
    openInNewTab: (id) => openChatPanel(services, { resume: id }),
    onActivity: () => { if (entry) refreshState(); },
  });
  if (resume) conversation.pendingResume = resume;

  entry = {
    conversation,
    isTab: true,
    isActive: () => panel.active,
    reveal: () => panel.reveal(undefined, false),
  };
  const reg = registry.add(entry);
  panel.onDidChangeViewState(() => {
    if (panel.active) registry.markActive(entry);
    refreshState();
  });
  panel.onDidDispose(() => {
    reg.dispose();
    conversation.dispose();
  });
  panel.webview.html = chatHtml(panel.webview, extensionUri);
  if (services.settings.get().lockEditorGroups) {
    Promise.resolve(vscode.commands.executeCommand('workbench.action.lockEditorGroup')).catch(() => {});
  }
  return entry;
}

module.exports = { openChatPanel, VIEW_TYPE };
