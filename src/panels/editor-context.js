// Editor context (package F): follows the open file editor and its selection, and the autosave
// helpers (setting `autosave`). The chips built on it and the text sent to the CLI are package K's
// (src/tagging/). Nothing is persisted.
const vscode = require('vscode');
const nodePath = require('path');
const { toSlashes } = require('./mentions');
const { linesMention } = require('../tagging/chips');

// Pure: the context of one editor state. `doc` {path, text?}; `sel` {start, end} 1-based lines or null.
function describe(filePath, sel, selText) {
  if (!filePath) return null;
  const path = toSlashes(filePath);
  return {
    path,
    name: nodePath.basename(path),
    lines: sel ? { start: sel.start, end: sel.end } : null,
    selText: sel ? String(selText || '') : '',
  };
}

// The context of a VS Code text editor (file scheme only), or null.
function fromEditor(editor) {
  if (!editor || editor.document.uri.scheme !== 'file') return null;
  const s = editor.selection;
  if (!s || s.isEmpty) return describe(editor.document.uri.fsPath, null, '');
  // A selection that ends at column 0 of the next line does not include that line.
  const end = s.end.character === 0 && s.end.line > s.start.line ? s.end.line - 1 : s.end.line;
  return describe(editor.document.uri.fsPath, { start: s.start.line + 1, end: end + 1 }, editor.document.getText(s));
}

// Follows the last file editor (a focused webview leaves activeTextEditor undefined, so the last one
// is kept while it is still visible). `onChange(ctx)` is called after a short pause.
function createEditorTracker() {
  let last = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.scheme === 'file' ? vscode.window.activeTextEditor : null;
  const listeners = new Set();
  let timer = null;
  const notify = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { for (const fn of listeners) fn(fromEditor(last)); }, 150);
  };
  const subs = [
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (ed && ed.document.uri.scheme === 'file') last = ed;
      notify();
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor === last) notify();
    }),
    vscode.window.onDidChangeVisibleTextEditors((eds) => {
      if (last && !eds.includes(last)) {
        last = eds.find((ed) => ed.document.uri.scheme === 'file') || null;
        notify();
      }
    }),
  ];
  return {
    current: () => fromEditor(last),
    onDidChange(fn) {
      listeners.add(fn);
      return { dispose: () => listeners.delete(fn) };
    },
    dispose() {
      clearTimeout(timer);
      subs.forEach((s) => s.dispose());
      listeners.clear();
    },
  };
}

// Pure: the file a tool call touches (Read/Edit/Write/MultiEdit/NotebookEdit), or null.
function toolFilePath(input) {
  if (!input || typeof input !== 'object') return null;
  const p = input.file_path || input.notebook_path;
  return typeof p === 'string' && p ? p : null;
}

// Autosave: saves open, unsaved file documents so Claude reads and edits what the user sees.
// `filter(fsPath)` picks which ones. Returns the number saved.
async function saveDirty(filter) {
  let n = 0;
  for (const doc of vscode.workspace.textDocuments) {
    if (!doc.isDirty || doc.uri.scheme !== 'file' || !filter(doc.uri.fsPath)) continue;
    if (await doc.save()) n += 1;
  }
  return n;
}

const samePath = (a, b) => nodePath.resolve(a).toLowerCase() === nodePath.resolve(b).toLowerCase();
// A child named `..x` is inside; only `..` itself or a `../` step leaves the folder.
const insideDir = (dir, p) => {
  const rel = nodePath.relative(dir, p);
  return Boolean(rel) && rel !== '..' && !rel.startsWith(`..${nodePath.sep}`) && !nodePath.isAbsolute(rel);
};

module.exports = {
  describe, linesMention, fromEditor, createEditorTracker, toolFilePath, saveDirty, samePath, insideDir,
};
