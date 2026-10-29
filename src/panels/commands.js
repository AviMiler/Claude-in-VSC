// claude-local.* commands.
const vscode = require('vscode');
const { openChatPanel } = require('./chat-panel');
const { VIEW_IDS } = require('./sidebar-view');
const { supportsSecondarySidebar } = require('../util/vscode-version');

function sidebarViewId() {
  return supportsSecondarySidebar() ? VIEW_IDS[0] : VIEW_IDS[1];
}

function registerCommands(context, services) {
  const { registry, logger } = services;
  const commands = {
    'claude-local.editor.open': () => openChatPanel(services),
    'claude-local.editor.openLast': () => {
      const last = registry.lastTab();
      if (last) {
        last.reveal();
        last.conversation.focusInput();
      } else {
        openChatPanel(services);
      }
    },
    'claude-local.sidebar.open': () => vscode.commands.executeCommand(`${sidebarViewId()}.focus`),
    'claude-local.newConversation': () => {
      const last = registry.lastTab();
      if (last) last.conversation.newConversation();
      else openChatPanel(services);
    },
    'claude-local.showLogs': () => logger.show(),
  };
  for (const [id, fn] of Object.entries(commands)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  }
}

module.exports = { registerCommands };
