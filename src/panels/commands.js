// claude-local.* commands.
const vscode = require('vscode');
const { openChatPanel } = require('./chat-panel');
const { VIEW_IDS } = require('./sidebar-view');
const { supportsSecondarySidebar } = require('../util/vscode-version');
const { mergeEnv } = require('../cli/env');
const { terminalLaunch } = require('../cli/terminal');
const { workspaceCwd } = require('../util/workspace');
const { mentionText, toSlashes } = require('./mentions');

function sidebarViewId() {
  return supportsSecondarySidebar() ? VIEW_IDS[0] : VIEW_IDS[1];
}

function registerCommands(context, services) {
  const { registry, logger, settings } = services;

  // Remembered only to return to it from the chat (Ctrl+Esc); never stored.
  let lastTextEditor = vscode.window.activeTextEditor;
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((ed) => { if (ed) lastTextEditor = ed; }));

  // The CLI's own interface in a VS Code terminal, with the same environment as the chat process.
  function openTerminal() {
    const s = settings.get();
    const { shellPath, shellArgs } = terminalLaunch(s.claudePath);
    const terminal = vscode.window.createTerminal({
      name: 'Claude Code',
      shellPath,
      shellArgs,
      cwd: workspaceCwd().cwd,
      env: mergeEnv({}, s.environmentVariables),
    });
    terminal.show();
    return terminal;
  }

  function openSidebar() {
    return vscode.commands.executeCommand(`${sidebarViewId()}.focus`);
  }

  // The main button: terminal if useTerminal, else the preferred location.
  function openMain() {
    const s = settings.get();
    if (s.useTerminal) return openTerminal();
    if (s.preferredLocation === 'sidebar') return openSidebar();
    const last = registry.lastTab();
    if (last) {
      last.reveal();
      last.conversation.focusInput();
      return undefined;
    }
    return openChatPanel(services);
  }

  function focusToggle() {
    const last = registry.lastTab();
    if (last && last.isActive && last.isActive()) {
      if (lastTextEditor) return vscode.window.showTextDocument(lastTextEditor.document, lastTextEditor.viewColumn);
      return vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    }
    return openMain();
  }

  const commands = {
    'claude-local.editor.open': () => (settings.get().useTerminal ? openTerminal() : openChatPanel(services)),
    'claude-local.editor.openLast': openMain,
    'claude-local.sidebar.open': openSidebar,
    'claude-local.newConversation': () => {
      const last = registry.lastTab();
      if (last) last.conversation.newConversation();
      else openChatPanel(services);
    },
    'claude-local.terminal.open': openTerminal,
    'claude-local.focusToggle': focusToggle,
    'claude-local.keyboardShortcuts': () => vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'claude-local'),
    // Alt+K: put @path of the open file into the chat box (selected lines are package F).
    'claude-local.insertAtMention': () => {
      const editor = vscode.window.activeTextEditor;
      const last = registry.lastTab();
      if (!editor || editor.document.uri.scheme !== 'file') return undefined;
      if (!last) return openChatPanel(services);
      const rel = toSlashes(vscode.workspace.asRelativePath(editor.document.uri, false));
      last.conversation.insertText(`${mentionText(rel)} `);
      last.reveal();
      return undefined;
    },
    'claude-local.showLogs': () => logger.show(),
    'claude-local.copyLogs': async () => {
      const lines = await logger.copy();
      vscode.window.showInformationMessage(`היומן הועתק ללוח (${lines} שורות).`);
    },
  };
  for (const [id, fn] of Object.entries(commands)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  }
}

module.exports = { registerCommands };
