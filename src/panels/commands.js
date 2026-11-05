// claude-local.* commands. Every way to open Claude is `claude-local.open` (places.js).
const vscode = require('vscode');
const { mergeEnv } = require('../cli/env');
const { terminalLaunch } = require('../cli/terminal');
const { workspaceCwd } = require('../util/workspace');
const transcripts = require('../history/transcripts');
const { mentionText, toSlashes } = require('./mentions');

function registerCommands(context, services) {
  const { registry, logger, settings, places } = services;

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

  // Open or focus Claude in the preferred place (terminal if useTerminal).
  async function open() {
    if (settings.get().useTerminal) return openTerminal();
    const host = await places.main();
    if (host.current) host.current.focusInput();
    return host;
  }

  // Past conversation by session id: focused where it is open, else opened in the preferred place.
  async function openSession(id, rename) {
    const existing = registry.findBySession(id);
    if (existing) {
      existing.reveal();
      if (rename) existing.conversation.renameSession(rename);
      return;
    }
    const host = await places.main();
    host.openSession(id, { rename });
  }

  function setClosedContext() {
    vscode.commands.executeCommand('setContext', 'claude-local:hasClosed', registry.hasClosed());
  }
  context.subscriptions.push(registry.onChange(setClosedContext));
  setClosedContext();

  const commands = {
    'claude-local.open': open,
    // Always a new conversation next to the others; a running one keeps running in the background.
    'claude-local.newConversation': async () => {
      const host = await places.main();
      host.newConversation();
    },
    'claude-local.terminal.open': openTerminal,
    'claude-local.focusToggle': () => {
      if (places.isFocused()) {
        if (lastTextEditor) return vscode.window.showTextDocument(lastTextEditor.document, lastTextEditor.viewColumn);
        return vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      }
      return open();
    },
    'claude-local.keyboardShortcuts': () => vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'claude-local'),
    // Alt+K: put @path of the open file into the chat box (selected lines are package F).
    'claude-local.insertAtMention': async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.scheme !== 'file') return;
      const rel = toSlashes(editor.document.uri.fsPath); // absolute: the CLI does not expand "@relative" (F-4)
      const host = places.active() && places.active().current ? places.active() : await places.main();
      host.revealPlace();
      if (host.current) host.current.insertText(`${mentionText(rel)} `);
    },
    'claude-local.reopenClosed': () => {
      const id = registry.popClosed();
      setClosedContext();
      if (id) return openSession(id);
      return vscode.window.showInformationMessage('אין שיחה סגורה לפתיחה מחדש.');
    },
    'claude-local.continueLast': () => {
      let first = null;
      try {
        first = transcripts.listSessions(workspaceCwd().cwd)[0];
      } catch (err) {
        logger.warn('history', `list failed: ${err.message}`);
      }
      if (first) return openSession(first.id);
      return vscode.window.showInformationMessage('אין שיחות קודמות להמשך.');
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
