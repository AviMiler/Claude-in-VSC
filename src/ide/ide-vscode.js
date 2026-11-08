// The IDE server's editor work (the only src/ide file that needs vscode): the tool functions for
// ide-rpc.js and the selection of an editor for selection_changed.
const vscode = require('vscode');

const SEVERITY = ['Error', 'Warning', 'Information', 'Hint'];

function toUri(value) {
  if (/^[a-z][a-z0-9+.-]+:\/\//i.test(value)) return vscode.Uri.parse(value);
  return vscode.Uri.file(value);
}

function getDiagnostics({ uri } = {}) {
  const pairs = uri ? [[toUri(uri), vscode.languages.getDiagnostics(toUri(uri))]] : vscode.languages.getDiagnostics();
  return pairs
    .filter(([, list]) => list.length)
    .map(([u, list]) => ({
      uri: u.toString(),
      diagnostics: list.map((d) => ({
        message: d.message,
        severity: SEVERITY[d.severity] || String(d.severity),
        source: d.source,
        range: { start: { line: d.range.start.line, character: d.range.start.character }, end: { line: d.range.end.line, character: d.range.end.character } },
      })),
    }));
}

function getOpenEditors() {
  const tabs = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (!input || !(input instanceof vscode.TabInputText)) continue;
      tabs.push({ uri: input.uri.toString(), label: tab.label, isActive: tab.isActive && group.isActive, isDirty: tab.isDirty, isPreview: tab.isPreview });
    }
  }
  return { tabs };
}

async function openFile({ filePath, preview = false, startText, endText, makeFrontmost = true }) {
  if (typeof filePath !== 'string' || !filePath) throw new Error('filePath is required');
  const doc = await vscode.workspace.openTextDocument(toUri(filePath));
  const editor = await vscode.window.showTextDocument(doc, { preview, preserveFocus: !makeFrontmost });
  if (startText) {
    const text = doc.getText();
    const from = text.indexOf(startText);
    if (from >= 0) {
      const toIdx = endText ? text.indexOf(endText, from) : -1;
      const to = toIdx >= 0 ? toIdx + endText.length : from + startText.length;
      const range = new vscode.Range(doc.positionAt(from), doc.positionAt(to));
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }
  }
  return `Opened ${filePath}`;
}

// {filePath, fileUrl, text, start, end} (0-based) of a file editor, or null.
function editorSelection(editor) {
  if (!editor || editor.document.uri.scheme !== 'file') return null;
  const s = editor.selection;
  const pos = (p) => ({ line: p.line, character: p.character });
  return {
    filePath: editor.document.uri.fsPath,
    fileUrl: editor.document.uri.toString(),
    text: s ? editor.document.getText(s) : '',
    start: pos(s ? s.start : new vscode.Position(0, 0)),
    end: pos(s ? s.end : new vscode.Position(0, 0)),
  };
}

const workspaceFolderPaths = () => (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath);

module.exports = { createVscodeIdeDeps: () => ({ getDiagnostics, getOpenEditors, openFile }), editorSelection, workspaceFolderPaths };
