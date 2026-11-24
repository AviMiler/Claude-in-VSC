// The "✻ Claude" status-bar item; works without an open file. It also shows the live state of the open
// conversations: working (with the turn timer), waiting for permission, finished (status-summary.js).
const vscode = require('vscode');
const { createStatusTracker } = require('./status-summary');

function registerStatusBar(context, services) {
  const item = vscode.window.createStatusBarItem('claude-local.status', vscode.StatusBarAlignment.Right, 100);
  item.name = 'Claude Code Local';
  item.command = 'claude-local.open';
  const tracker = createStatusTracker();
  let ticker = null;
  let doneTimer = null;

  function refresh() {
    const s = tracker.update(services.registry.conversations(), Date.now());
    item.text = s.text;
    item.tooltip = s.tooltip;
    // The timer needs a tick while working; "finished" needs one more repaint when it expires.
    if (s.state === 'working' && !ticker) ticker = setInterval(refresh, 1000);
    if (s.state !== 'working' && ticker) { clearInterval(ticker); ticker = null; }
    clearTimeout(doneTimer);
    doneTimer = s.state === 'finished' ? setTimeout(refresh, 8100) : null;
  }

  if (services && services.registry) {
    context.subscriptions.push(services.registry.onChange(refresh));
    context.subscriptions.push({ dispose: () => { clearInterval(ticker); clearTimeout(doneTimer); } });
  }
  refresh();
  item.show();
  context.subscriptions.push(item);
}

module.exports = { registerStatusBar };
