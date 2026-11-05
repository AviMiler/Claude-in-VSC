// The source button (packages H and I): by default NO source. The user opens the file explorer and picks
// a file or a folder (one at a time); Claude is told to start the work from it: an instruction with an
// `@path` mention in front of the next message, repeated only when the choice changes (not on every
// message, to spare tokens). Nothing is persisted: closing the conversation or reloading the window
// clears it (decided 2026-11-05).
const vscode = require('vscode');
const mentions = require('./mentions');

// Pure: what leaves for the CLI. `file` is the absolute path chosen (or null), `lastSent` the path last
// handed to the model in this conversation, `isDir` whether the choice is a folder.
// Returns {text, sentFile}. The instruction is explicit because whether the CLI expands `@path` in
// stream-json is unverified: the model can open the file or list the folder itself from the path.
function withWorkFile(text, file, lastSent, isDir = false) {
  if (!file || file === lastSent) return { text, sentFile: lastSent };
  const mention = mentions.mentionText(file);
  const instruction = isDir
    ? `זו תיקיית המקור של השיחה הזו: ${mention}. עבור על התוכן שלה ותתחיל לעבוד ממנה.`
    : `זה קובץ המקור של השיחה הזו: ${mention}. קרא אותו ותתחיל לעבוד ממנו.`;
  return { text: `${instruction}\n\n${text}`, sentFile: file };
}

// The chosen path (null = none, the default).
function current(conv) {
  return conv.workFile || null;
}

// Tells the webview what the button shows. Not part of the replay log: it is always current.
function postState(conv) {
  if (conv.disposed || !conv.webview) return;
  conv.webview.postMessage({ type: 'workFile', path: current(conv), isDir: Boolean(conv.workFileIsDir) });
}

// The project's file explorer (the system dialog, opened in the project folder): a file or a folder.
async function chooseFromExplorer(conv) {
  const uris = await vscode.window.showOpenDialog({
    defaultUri: conv.cwd ? vscode.Uri.file(conv.cwd) : undefined,
    canSelectFiles: true,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'בחירה',
    title: 'בחירת קובץ או תיקיית מקור לשיחה',
  });
  if (!uris || !uris.length) return null;
  const stat = await vscode.workspace.fs.stat(uris[0]);
  return { path: mentions.toSlashes(uris[0].fsPath), isDir: stat.type === vscode.FileType.Directory };
}

// A click: the explorer. When a source is already set, first ask whether to change or remove it.
async function pick(conv) {
  if (!vscode.window || !vscode.window.showOpenDialog) return;
  let choice = { change: true };
  if (conv.workFile) {
    const change = 'בחירת קובץ או תיקייה אחרים…';
    const remove = 'הסרת המקור';
    const answer = await vscode.window.showQuickPick([change, remove], { placeHolder: `המקור הנוכחי: ${conv.workFile}` });
    if (!answer) return;
    choice = answer === remove ? { remove: true } : { change: true };
  }
  if (choice.remove) {
    conv.workFile = null;
    conv.workFileIsDir = false;
  } else {
    const picked = await chooseFromExplorer(conv);
    if (!picked) return;
    conv.workFile = picked.path;
    conv.workFileIsDir = picked.isDir;
  }
  conv.lastWorkFileSent = null; // a new choice is handed to the model with the next message
  conv.services.logger.info('session', `source ${conv.workFile ? (conv.workFileIsDir ? 'folder' : 'file') : 'cleared'}`);
  postState(conv);
}

// Called by Conversation.send: the text for the CLI.
function applyToSend(conv, text) {
  const out = withWorkFile(text, current(conv), conv.lastWorkFileSent, Boolean(conv.workFileIsDir));
  conv.lastWorkFileSent = out.sentFile;
  return out.text;
}

module.exports = { withWorkFile, current, postState, pick, applyToSend };
