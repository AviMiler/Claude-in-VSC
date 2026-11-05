// The working-file button (package H): shows the file the work is on, by default the file open in
// the editor; a click picks another file (or goes back to "the open file"). The chosen file is
// handed to the model as an `@path` mention in front of the next message, once per change of file
// (not on every message, to spare tokens). Nothing is persisted.
const vscode = require('vscode');
const mentions = require('./mentions');

// Pure: what leaves for the CLI. `file` is the absolute path in effect (or null), `lastSent` the file
// last handed to the model in this conversation.
// Returns {text, sentFile}: the text with the mention in front when the file changed.
function withWorkFile(text, file, lastSent) {
  if (!file || file === lastSent) return { text, sentFile: lastSent };
  return { text: `${mentions.mentionText(file)} ${text}`, sentFile: file };
}

function activeFile() {
  const editor = vscode.window && vscode.window.activeTextEditor;
  const uri = editor && editor.document && editor.document.uri;
  return uri && uri.scheme === 'file' ? mentions.toSlashes(uri.fsPath) : null;
}

// The file in effect: the user's pick, else the open file (null when none).
function current(conv) {
  return conv.workFile || activeFile();
}

// Tells the webview what the button shows. Not part of the replay log: it is always current.
function postState(conv) {
  if (conv.disposed || !conv.webview) return;
  const path = current(conv);
  conv.webview.postMessage({ type: 'workFile', path, auto: !conv.workFile });
}

// Opens a picker: "the open file" (automatic) first, then the project's files.
async function pick(conv) {
  if (!vscode.window || !vscode.window.showQuickPick) return;
  const entries = await conv.loadEntries();
  const files = entries.filter((e) => !e.endsWith('/')).slice(0, 5000);
  const items = [{ label: '$(eye) הקובץ הפתוח בעורך (אוטומטי)', auto: true }]
    .concat(files.map((rel) => ({ label: rel.split('/').pop(), description: rel, rel })));
  const choice = await vscode.window.showQuickPick(items, { placeHolder: 'בחירת קובץ עבודה', matchOnDescription: true });
  if (!choice) return;
  conv.workFile = choice.auto ? null : mentions.absPath(conv.cwd, choice.rel);
  conv.lastWorkFileSent = null; // a new choice is handed to the model with the next message
  conv.services.logger.info('session', `working file ${choice.auto ? 'auto' : 'picked'}`);
  postState(conv);
}

// Called by Conversation.send: the text for the CLI.
function applyToSend(conv, text) {
  const out = withWorkFile(text, current(conv), conv.lastWorkFileSent);
  conv.lastWorkFileSent = out.sentFile;
  return out.text;
}

// Follows the editor: the button changes when another file becomes active.
function watchEditor(conv) {
  if (!vscode.window || !vscode.window.onDidChangeActiveTextEditor) return null;
  return vscode.window.onDidChangeActiveTextEditor(() => {
    if (!conv.workFile) postState(conv);
  });
}

module.exports = { withWorkFile, current, postState, pick, applyToSend, watchEditor };
