'use strict';
// VS Code wiring for nav-tools.js. The only file in the navigation server that requires 'vscode'.
// It builds the injected deps that createNavTools() expects, so the tool code stays testable without VS Code.
const fs = require('fs');
const vscode = require('vscode');

function createVscodeNavDeps() {
  const folders = (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath);
  return {
    workspaceFolders: folders,
    toUri: (p) => vscode.Uri.file(p),
    // Loads the document into memory (no editor is shown) so the providers can answer for it.
    openDocument: (uri) => vscode.workspace.openTextDocument(uri),
    executeDocumentSymbolProvider: (uri) =>
      vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri),
    executeReferenceProvider: (uri, pos) =>
      vscode.commands.executeCommand(
        'vscode.executeReferenceProvider',
        uri,
        new vscode.Position(pos.line, pos.character),
      ),
    readFile: (p) => fs.promises.readFile(p, 'utf8'),
  };
}

module.exports = { createVscodeNavDeps };
