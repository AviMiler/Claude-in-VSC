// The plan as a read-only virtual Markdown document (TextDocumentContentProvider): nothing is
// written to disk. The text is whatever the assistant wrote before ExitPlanMode.
const vscode = require('vscode');

const SCHEME = 'claude-local-plan';

function createPlanDocs() {
  const docs = new Map(); // path -> text
  const emitter = new vscode.EventEmitter();
  let counter = 0;
  const provider = {
    onDidChange: emitter.event,
    provideTextDocumentContent: (uri) => docs.get(uri.path) || '',
  };
  const registration = vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider);

  return {
    async open(text) {
      counter += 1;
      const uri = vscode.Uri.from({ scheme: SCHEME, path: `/תוכנית-${counter}.md` });
      docs.set(uri.path, text);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
    },
    dispose() {
      registration.dispose();
      emitter.dispose();
      docs.clear();
    },
  };
}

module.exports = { createPlanDocs, SCHEME };
