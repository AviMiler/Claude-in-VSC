// The editor-tab place (WebviewPanel "claudeLocalPanel"): one tab hosting several conversations,
// like the sidebar. Closing the tab closes its conversations (they go to the closed list).
const vscode = require('vscode');
const { chatHtml, webviewOptions } = require('./webview-html');
const { ConversationHost } = require('./conversation-host');
const { decorateTitle } = require('./session-model');

const VIEW_TYPE = 'claudeLocalPanel';

// The tab title carries the colour-dot marker of the hidden conversations (blue = waiting for
// permission, orange = finished unread); VS Code has no colour API for tabs.
function openChatPanel(services) {
  const { extensionUri } = services;
  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    'Claude',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    { ...webviewOptions(extensionUri), retainContextWhenHidden: true },
  );
  panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'claude-mascot.svg');
  const host = new ConversationHost({
    services,
    kind: 'editor',
    revealPlace: () => panel.reveal(undefined, false),
    isVisible: () => panel.visible,
    onState: ({ title, attention }) => { panel.title = decorateTitle(title || 'Claude', attention.state); },
  });
  host.panel = panel;
  host.bind(panel.webview);
  panel.onDidChangeViewState(() => host.onVisibility());
  panel.onDidDispose(() => {
    host.dispose();
    if (services.places) services.places.editorClosed(host);
  });
  panel.webview.html = chatHtml(panel.webview, extensionUri);
  if (services.settings.get().lockEditorGroups) {
    Promise.resolve(vscode.commands.executeCommand('workbench.action.lockEditorGroup')).catch(() => {});
  }
  return host;
}

module.exports = { openChatPanel, VIEW_TYPE };
