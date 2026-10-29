// The "✻ Claude" status-bar item; works without an open file.
const vscode = require('vscode');

function registerStatusBar(context) {
  const item = vscode.window.createStatusBarItem('claude-local.status', vscode.StatusBarAlignment.Right, 100);
  item.name = 'Claude Code Local';
  item.text = '✻ Claude';
  item.tooltip = 'פתיחת Claude Code Local';
  item.command = 'claude-local.editor.openLast';
  item.show();
  context.subscriptions.push(item);
}

module.exports = { registerStatusBar };
