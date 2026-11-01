// The sidebar place (secondary sidebar, or the activity bar on VS Code before 1.106): one host with
// several conversations. The host outlives the webview: if VS Code disposes the view (moved or
// closed), the conversations keep running and are redrawn when the view is resolved again.
const vscode = require('vscode');
const { chatHtml, webviewOptions } = require('./webview-html');
const { ConversationHost } = require('./conversation-host');
const { supportsSecondarySidebar } = require('../util/vscode-version');

const VIEW_IDS = ['claudeLocalSidebarSecondary', 'claudeLocalSidebar'];

function sidebarViewId() {
  return supportsSecondarySidebar() ? VIEW_IDS[0] : VIEW_IDS[1];
}

function badgeTooltip({ waiting, unread }) {
  const parts = [];
  if (waiting) parts.push(`${waiting} ממתינות לאישור`);
  if (unread) parts.push(`${unread} הסתיימו ברקע`);
  return parts.join(', ');
}

function registerSidebar(context, services) {
  let view = null;
  const host = new ConversationHost({
    services,
    kind: 'sidebar',
    revealPlace: () => (view ? view.show(false) : vscode.commands.executeCommand(`${sidebarViewId()}.focus`)),
    isVisible: () => Boolean(view && view.visible),
    onState: ({ title, attention }) => {
      if (!view) return;
      view.description = title || undefined;
      const count = attention.waiting + attention.unread;
      // ViewBadge (VS Code 1.72+): the number of hidden conversations that need the user.
      view.badge = count ? { value: count, tooltip: badgeTooltip(attention) } : undefined;
    },
  });

  const provider = {
    resolveWebviewView(resolved) {
      view = resolved;
      resolved.webview.options = webviewOptions(services.extensionUri);
      host.bind(resolved.webview);
      resolved.onDidChangeVisibility(() => host.onVisibility());
      resolved.onDidDispose(() => {
        if (view === resolved) view = null;
        host.unbind();
      });
      resolved.webview.html = chatHtml(resolved.webview, services.extensionUri);
    },
  };
  for (const id of VIEW_IDS) {
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(id, provider, { webviewOptions: { retainContextWhenHidden: true } }),
    );
  }
  context.subscriptions.push({ dispose: () => host.dispose() });
  return host;
}

module.exports = { registerSidebar, sidebarViewId, VIEW_IDS };
