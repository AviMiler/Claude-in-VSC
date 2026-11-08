// Editor context (package F, the chips fallback of PLAN.md stage 3): the open file and the selected
// lines are shown as removable chips above the box and handed to the model in front of the next
// message, each only when it changed (to spare tokens). Also the autosave helpers (settings
// `attachOpenFile`, `attachSelection`, `autosave`). Nothing is persisted.
// The IDE-server route (src/ide/) reuses the tracker below to send selection_changed to the CLI;
// the chips stay as the fallback when the CLI does not connect.
const vscode = require('vscode');
const nodePath = require('path');
const { toSlashes, mentionText } = require('./mentions');

const SELECTION_MAX_CHARS = 8000;

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

const fileKey = (ctx) => (ctx ? ctx.path : null);
const selKey = (ctx) => (ctx && ctx.lines ? `${ctx.path}#${ctx.lines.start}-${ctx.lines.end}` : null);

// `@path#5-10` (or `#5` for one line): Alt+K's text and the chip's mention.
function linesMention(ctx) {
  if (!ctx.lines) return mentionText(ctx.path);
  const { start, end } = ctx.lines;
  return mentionText(`${ctx.path}#${start === end ? start : `${start}-${end}`}`);
}

// What the chips show: `flags` {attachOpenFile, attachSelection}, `dismissed` {file, sel} keys the
// user removed (a removed chip comes back when the file or the selection changes).
function chips(ctx, flags, dismissed = {}) {
  const out = { file: null, lines: null };
  if (!ctx) return out;
  if (flags.attachOpenFile && dismissed.file !== fileKey(ctx)) out.file = { name: ctx.name, path: ctx.path };
  if (flags.attachSelection && ctx.lines && dismissed.sel !== selKey(ctx)) out.lines = { ...ctx.lines, name: ctx.name };
  return out;
}

// Pure: the message with the context in front. `last` {file, sel}: the keys last handed to the model.
// Returns {text, last}. The selected text itself is included (capped), because the CLI does not
// expand `@path` in stream-json mode (mentions.js).
function withContext(text, ctx, flags, dismissed = {}, last = {}) {
  const shown = chips(ctx, flags, dismissed);
  const parts = [];
  const next = { ...last };
  if (shown.file && fileKey(ctx) !== last.file) {
    parts.push(`[הקשר מהעורך] הקובץ הפתוח בעורך: ${mentionText(ctx.path)}`);
    next.file = fileKey(ctx);
  }
  if (shown.lines && selKey(ctx) !== last.sel) {
    let body = ctx.selText;
    if (body.length > SELECTION_MAX_CHARS) body = `${body.slice(0, SELECTION_MAX_CHARS)}\n… (קוצר)`;
    parts.push(`[הקשר מהעורך] השורות שנבחרו: ${linesMention(ctx)}\n\`\`\`\n${body}\n\`\`\``);
    next.sel = selKey(ctx);
  }
  if (!parts.length) return { text, last: next };
  return { text: `${parts.join('\n')}\n\n${text}`, last: next };
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
    editor: () => last, // the raw editor, for the IDE server's selection_changed (src/ide/)
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
const insideDir = (dir, p) => {
  const rel = nodePath.relative(dir, p);
  return rel && !rel.startsWith('..') && !nodePath.isAbsolute(rel);
};

module.exports = {
  describe, chips, withContext, linesMention, fromEditor, createEditorTracker, toolFilePath, saveDirty, samePath, insideDir,
};
