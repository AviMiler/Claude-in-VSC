// The VS Code side of the new-diagnostics block: reads a workspace file's errors and warnings and waits briefly for the language server to refresh them.
// The only `require('vscode')` of this feature; the tracker itself is src/tagging/diagnostics.js.
const vscode = require('vscode');
const { insideFolders } = require('./diagnostics');
const editorContext = require('../panels/editor-context');

const SEVERITY = { 0: 'error', 1: 'warning' }; // vscode.DiagnosticSeverity.Error / .Warning

const codeText = (c) => (c && typeof c === 'object' ? c.value : c);

// createSource() -> {read(path) -> Diag[] | null, waitForChange(path, ms) -> Promise<void>} | null
// null when this VS Code has no diagnostics API (also the test stub). read() answers null for a
// file outside the open workspace folders (the same limit as the nav tools).
function createSource() {
  const langs = vscode.languages;
  if (!langs || typeof langs.getDiagnostics !== 'function' || !vscode.Uri) return null;
  const folders = () => ((vscode.workspace && vscode.workspace.workspaceFolders) || []).map((f) => f.uri.fsPath);
  return {
    read(p) {
      if (!insideFolders(p, folders())) return null;
      return langs.getDiagnostics(vscode.Uri.file(p))
        .filter((d) => SEVERITY[d.severity])
        .map((d) => ({
          severity: SEVERITY[d.severity],
          line: d.range.start.line + 1,
          column: d.range.start.character + 1,
          message: d.message,
          source: d.source,
          code: codeText(d.code),
        }));
    },
    waitForChange(p, ms) {
      return new Promise((resolve) => {
        let sub = null;
        const done = () => {
          clearTimeout(timer);
          if (sub) sub.dispose();
          resolve();
        };
        const timer = setTimeout(done, ms);
        sub = langs.onDidChangeDiagnostics((e) => {
          if ((e.uris || []).some((u) => editorContext.samePath(u.fsPath, p))) done();
        });
      });
    },
  };
}

module.exports = { createSource };
