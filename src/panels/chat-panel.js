// A conversation in an editor tab (WebviewPanel "claudeLocalPanel").
const vscode = require('vscode');
const { Conversation } = require('./conversation');
const { chatHtml, webviewOptions } = require('./webview-html');

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

  const conversation = new Conversation({
    webview: panel.webview,
    services,
    setTitle: (t) => { panel.title = t || 'Claude'; },
    openInNewTab: (id) => openChatPanel(services, { resume: id }),
  });
  if (resume) conversation.pendingResume = resume;

  const entry = {
    conversation,
    isTab: true,
    reveal: () => panel.reveal(undefined, false),
  };
  const reg = registry.add(entry);
  panel.onDidChangeViewState(() => { if (panel.active) registry.markActive(entry); });
  panel.onDidDispose(() => {
    reg.dispose();
    conversation.dispose();
  });
  panel.webview.html = chatHtml(panel.webview, extensionUri);
  return entry;
}

module.exports = { openChatPanel, VIEW_TYPE };
