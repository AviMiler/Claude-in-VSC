// The /btw side panel: a singleton editor-side WebviewPanel ("claudeLocalBtw") where the user can
// keep asking follow-ups. The conversation logic is btw-session.js; this file is only the vscode
// glue. Closing the panel drops its history (the extension persists nothing).
const vscode = require('vscode');
const { btwHtml, webviewOptions } = require('./webview-html');
const { BtwSession } = require('./btw-session');

const VIEW_TYPE = 'claudeLocalBtw';

function createBtwPanel(services) {
  let panel = null;
  let session = null;
  let ready = false;
  let queue = []; // messages posted before the webview sent `ready`
  let seq = 0;

  function send(msg) {
    if (!panel) return;
    if (ready) panel.webview.postMessage(msg);
    else queue.push(msg);
  }

  function handle(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.type) {
      case 'ready':
        ready = true;
        for (const q of queue) panel.webview.postMessage(q);
        queue = [];
        break;
      case 'ask': session.ask(String(m.id || ''), String(m.text || '')); break;
      case 'cancel': session.cancel(String(m.id || '')); break;
      case 'clear': session.clear(); break;
      case 'openLink': {
        const url = String(m.url || '');
        if (/^https?:\/\//i.test(url)) vscode.env.openExternal(vscode.Uri.parse(url));
        break;
      }
      default: break;
    }
  }

  function create() {
    const { extensionUri } = services;
    panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      'שאלה צדדית',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { ...webviewOptions(extensionUri), retainContextWhenHidden: true },
    );
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'claude-logo.svg');
    ready = false;
    queue = [];
    session = new BtwSession({ post: send, logger: services.logger });
    panel.webview.onDidReceiveMessage(handle);
    panel.onDidChangeViewState(() => { if (panel && panel.visible) send({ type: 'focus' }); });
    panel.onDidDispose(() => {
      session.dispose();
      panel = null;
      session = null;
    });
    panel.webview.html = btwHtml(panel.webview, extensionUri);
  }

  // Creates or reveals the panel; a non-empty `question` is asked right away (shown in the thread too).
  function open(runOptions, question) {
    if (panel) panel.reveal(undefined, false);
    else create();
    session.setRunOptions(runOptions);
    const text = String(question || '').trim();
    if (!text) return send({ type: 'focus' });
    const id = `btw-h${Date.now()}-${++seq}`;
    send({ type: 'question', id, text });
    session.ask(id, text);
  }

  return { open, dispose() { if (panel) panel.dispose(); } };
}

module.exports = { createBtwPanel, VIEW_TYPE };
