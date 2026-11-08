// Shared diff view: shows two texts side by side in VS Code's diff editor, both as read-only
// virtual documents (nothing is written to disk). Built once for `/diff`; package F (per-block
// approval) and the IDE server's `openDiff` reuse `show`.
const vscode = require('vscode');
const nodePath = require('path');

const SCHEME = 'claude-local-diff';

function createDiffView() {
  const docs = new Map(); // uri path -> text
  const emitter = new vscode.EventEmitter();
  let counter = 0;
  const registration = vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
    onDidChange: emitter.event,
    provideTextDocumentContent: (uri) => docs.get(uri.path) || '',
  });

  // The file name keeps its extension so the editor picks the right language colouring.
  function virtualUri(side, fileName, text) {
    const uri = vscode.Uri.from({ scheme: SCHEME, path: `/${counter}/${side}/${fileName}` });
    docs.set(uri.path, text);
    return uri;
  }

  return {
    // left/right: the texts; filePath: names the documents; title: the editor tab title.
    // Returns both URIs (per-block review puts its CodeLens on the right one).
    async show({ left, right, filePath, title }) {
      counter += 1;
      const fileName = nodePath.basename(filePath || 'קובץ.txt');
      const leftUri = virtualUri('before', fileName, String(left || ''));
      const rightUri = virtualUri('after', fileName, String(right || ''));
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title || `${fileName} (לפני ↔ אחרי)`, { preview: false });
      return { leftUri, rightUri };
    },
    dispose() {
      registration.dispose();
      emitter.dispose();
      docs.clear();
    },
  };
}

module.exports = { createDiffView, SCHEME };
