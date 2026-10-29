// A conversation in the sidebar (secondary sidebar, or the activity bar on old VS Code).
const vscode = require('vscode');
const { Conversation } = require('./conversation');
const { chatHtml, webviewOptions } = require('./webview-html');
const { openChatPanel } = require('./chat-panel');

const VIEW_IDS = ['claudeLocalSidebarSecondary', 'claudeLocalSidebar'];

function createProvider(services) {
  return {
    resolveWebviewView(view) {
      view.webview.options = webviewOptions(services.extensionUri);
      const conversation = new Conversation({
        webview: view.webview,
        services,
        setTitle: (t) => { view.description = t && t !== 'Claude' ? t : undefined; },
        openInNewTab: (id) => openChatPanel(services, { resume: id }),
      });
      const reg = services.registry.add({
        conversation,
        isTab: false,
        reveal: () => view.show(false),
      });
      view.onDidDispose(() => {
        reg.dispose();
        conversation.dispose();
      });
      view.webview.html = chatHtml(view.webview, services.extensionUri);
    },
  };
}

function registerSidebar(context, services) {
  const provider = createProvider(services);
  for (const id of VIEW_IDS) {
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(id, provider, { webviewOptions: { retainContextWhenHidden: true } }),
    );
  }
}

module.exports = { registerSidebar, VIEW_IDS };
