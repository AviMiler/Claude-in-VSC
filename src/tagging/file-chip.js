// The file chip and the lines chip of one conversation (package K, PLAN.md section 10), the vscode
// side: the chip state, the click menu's actions (automatic, "בחר קובץ..." through VS Code's own
// open dialog, a recent choice), the return to automatic after a send, and what leaves for the CLI.
// The chip state lives on the conversation in memory only; the recent list is shared (recent-files).
const vscode = require('vscode');
const chips = require('./chips');
const recentFiles = require('./recent-files');
const editorContext = require('../panels/editor-context');
const { toSlashes } = require('../panels/mentions');

// A fresh state: automatic, nothing removed, no "back to automatic" mark.
function createState() {
  return { manual: null, reverted: false, dismissed: {} };
}

// The folders that count as "the project": the workspace folders, else the conversation's cwd.
function projectDirs(conv) {
  const folders = (vscode.workspace && vscode.workspace.workspaceFolders) || [];
  const dirs = folders.map((f) => f.uri.fsPath);
  if (!dirs.length && conv.cwd) dirs.push(conv.cwd);
  return dirs;
}

function isOutside(conv, p) {
  const dirs = projectDirs(conv);
  if (!dirs.length) return false;
  return !dirs.some((d) => editorContext.samePath(d, p) || editorContext.insideDir(d, p));
}

function flags(conv) {
  const s = conv.services.settings.get();
  return { attachOpenFile: s.attachOpenFile !== false, attachSelection: s.attachSelection !== false };
}

function currentCtx(conv) {
  return conv.services.editorTracker ? conv.services.editorTracker.current() : null;
}

function shown(conv) {
  return chips.view(currentCtx(conv), flags(conv), conv.chip, (p) => isOutside(conv, p));
}

// Tells the webview what the chips show, with the recent list for the click menu. Not part of the
// replay log: it is always current.
function postState(conv) {
  if (conv.disposed || !conv.webview) return;
  conv.webview.postMessage({ type: 'editorContext', ...shown(conv), recents: recentFiles.shared.list() });
}

// VS Code's own open dialog at the project root: one file or one folder.
async function chooseFromExplorer(conv) {
  if (!vscode.window || !vscode.window.showOpenDialog) return null;
  const root = projectDirs(conv)[0];
  const uris = await vscode.window.showOpenDialog({
    defaultUri: root ? vscode.Uri.file(root) : undefined,
    canSelectFiles: true,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'בחירה',
    title: 'בחירת קובץ או תיקייה לתיוג',
  });
  if (!uris || !uris.length) return null;
  const stat = await vscode.workspace.fs.stat(uris[0]);
  return { path: toSlashes(uris[0].fsPath), isDir: stat.type === vscode.FileType.Directory };
}

function setManual(conv, picked) {
  conv.chip.manual = { path: picked.path, isDir: Boolean(picked.isDir) };
  recentFiles.shared.add(picked.path, picked.isDir);
  conv.services.logger.info('session', `file chip: manual ${picked.isDir ? 'folder' : 'file'}${isOutside(conv, picked.path) ? ' (outside the project)' : ''}`);
}

// A webview request: `action` 'auto' | 'pick' | 'recent' | 'remove' | 'removeLines' | 'ack'.
async function handle(conv, msg) {
  const st = conv.chip;
  st.reverted = false; // any action on the chip, typing or a send ends the "back to automatic" mark
  switch (msg.action) {
    case 'auto':
      st.manual = null;
      break;
    case 'pick': {
      const picked = await chooseFromExplorer(conv);
      if (picked) setManual(conv, picked);
      break;
    }
    case 'recent': {
      const item = recentFiles.shared.list().find((i) => chips.pathKey(i.path) === chips.pathKey(msg.path));
      if (item) setManual(conv, item);
      break;
    }
    case 'remove': {
      // A manual choice goes back to automatic; the automatic chip is hidden until the file changes.
      const ctx = currentCtx(conv);
      if (st.manual) st.manual = null;
      else if (ctx) st.dismissed.file = chips.pathKey(ctx.path);
      break;
    }
    case 'removeLines': {
      const ctx = currentCtx(conv);
      if (ctx && ctx.lines) st.dismissed.sel = chips.selKey(ctx);
      break;
    }
    default: // 'ack': typing or a click cleared the mark
      break;
  }
  postState(conv);
}

// Called by Conversation.send (not for hidden prompts): the text for the CLI. After a send with a
// manual choice the chip returns to automatic and is marked until the next action.
function applyToSend(conv, text) {
  const view = shown(conv);
  const out = chips.withContext(text, view, currentCtx(conv), conv.lastContextSent);
  if (out.text !== text) conv.services.logger.info('session', 'editor context attached');
  conv.lastContextSent = out.last;
  const wasManual = Boolean(conv.chip.manual);
  conv.chip.manual = null;
  conv.chip.reverted = wasManual;
  postState(conv);
  return out.text;
}

// Autosave before a send also covers the chip's file or folder when it is outside the project.
function autosaveFilter(conv) {
  const file = shown(conv).file;
  return (p) => (conv.cwd && editorContext.insideDir(conv.cwd, p))
    || (file && (editorContext.samePath(file.path, p) || (file.isDir && editorContext.insideDir(file.path, p))));
}

module.exports = { createState, postState, handle, applyToSend, autosaveFilter, isOutside };
