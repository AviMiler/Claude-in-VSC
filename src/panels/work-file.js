// The working-file button (package H): by default NO file. The user picks a file (a QuickPick of the
// project's files, or the file open in the editor at that moment) and Claude is told to start the work
// from it: an instruction plus an `@path` mention in front of the next message, repeated only when the
// chosen file changes (not on every message, to spare tokens). Nothing is persisted.
const vscode = require('vscode');
const mentions = require('./mentions');

// Pure: what leaves for the CLI. `file` is the absolute path chosen (or null), `lastSent` the file
// last handed to the model in this conversation. Returns {text, sentFile}.
// The instruction is explicit because whether the CLI expands `@path` in stream-json is unverified:
// the model can open the file itself from the path.
function withWorkFile(text, file, lastSent) {
  if (!file || file === lastSent) return { text, sentFile: lastSent };
  return { text: `התחל את העבודה מהקובץ ${mentions.mentionText(file)}.\n\n${text}`, sentFile: file };
}

function activeFile() {
  const editor = vscode.window && vscode.window.activeTextEditor;
  const uri = editor && editor.document && editor.document.uri;
  return uri && uri.scheme === 'file' ? mentions.toSlashes(uri.fsPath) : null;
}

// The chosen file (null = none, the default).
function current(conv) {
  return conv.workFile || null;
}

// Tells the webview what the button shows. Not part of the replay log: it is always current.
function postState(conv) {
  if (conv.disposed || !conv.webview) return;
  conv.webview.postMessage({ type: 'workFile', path: current(conv) });
}

// Opens a picker: "no file", then the file open in the editor (if any), then the project's files.
async function pick(conv) {
  if (!vscode.window || !vscode.window.showQuickPick) return;
  const entries = await conv.loadEntries();
  const files = entries.filter((e) => !e.endsWith('/')).slice(0, 5000);
  const open = activeFile();
  const items = [{ label: '$(close) ללא קובץ', none: true }];
  if (open) items.push({ label: '$(eye) הקובץ הפתוח עכשיו בעורך', description: open.split('/').pop(), abs: open });
  items.push(...files.map((rel) => ({ label: rel.split('/').pop(), description: rel, abs: mentions.absPath(conv.cwd, rel) })));
  const choice = await vscode.window.showQuickPick(items, { placeHolder: 'בחירת קובץ עבודה', matchOnDescription: true });
  if (!choice) return;
  conv.workFile = choice.none ? null : choice.abs;
  conv.lastWorkFileSent = null; // a new choice is handed to the model with the next message
  conv.services.logger.info('session', `working file ${choice.none ? 'cleared' : 'picked'}`);
  postState(conv);
}

// Called by Conversation.send: the text for the CLI.
function applyToSend(conv, text) {
  const out = withWorkFile(text, current(conv), conv.lastWorkFileSent);
  conv.lastWorkFileSent = out.sentFile;
  return out.text;
}

module.exports = { withWorkFile, current, postState, pick, applyToSend };
