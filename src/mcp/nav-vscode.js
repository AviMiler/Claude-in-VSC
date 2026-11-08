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
    executeDefinitionProvider: (uri, pos) =>
      vscode.commands.executeCommand(
        'vscode.executeDefinitionProvider',
        uri,
        new vscode.Position(pos.line, pos.character),
      ),
    // Symbols matching a name across the workspace; returned as is (nav-tools reads name, kind, location).
    executeWorkspaceSymbolProvider: (query) =>
      vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', query),
    // Hover text (type info, docs) at a position.
    executeHoverProvider: (uri, pos) =>
      vscode.commands.executeCommand(
        'vscode.executeHoverProvider',
        uri,
        new vscode.Position(pos.line, pos.character),
      ),
    // Call-hierarchy items for the symbol at a position; the input for incomingCalls/outgoingCalls.
    prepareCallHierarchy: (uri, pos) =>
      vscode.commands.executeCommand(
        'vscode.prepareCallHierarchy',
        uri,
        new vscode.Position(pos.line, pos.character),
      ),
    // Who calls this item (item comes from prepareCallHierarchy).
    incomingCalls: (item) => vscode.commands.executeCommand('vscode.provideIncomingCalls', item),
    // What this item calls (item comes from prepareCallHierarchy).
    outgoingCalls: (item) => vscode.commands.executeCommand('vscode.provideOutgoingCalls', item),
    readFile: (p) => fs.promises.readFile(p, 'utf8'),
    searchWorkspaceText,
  };
}

const SEARCH_GLOB = '**/*.{js,jsx,ts,tsx,mjs,cjs}';
const SEARCH_EXCLUDE = '{**/node_modules/**,**/.git/**}';
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_MATCHES = 500;

// Line-by-line text search over the workspace's JS/TS files (on-disk content). nav-tools uses it to find
// import/require lines (findImporters) and the files that mention a name (opened before a cross-file
// search so the language server includes them). Bounded: 1 MB per file, 500 matches total; a cut
// result carries `capped = true`. An invalid regular expression rejects the promise; errors on single
// files are skipped.
async function searchWorkspaceText(pattern, folders) {
  const re = new RegExp(pattern);
  const results = [];
  for (const folder of folders || []) {
    const include = new vscode.RelativePattern(vscode.Uri.file(folder), SEARCH_GLOB);
    const uris = await vscode.workspace.findFiles(include, SEARCH_EXCLUDE);
    for (const uri of uris) {
      if (results.length >= MAX_MATCHES) { results.capped = true; return results; }
      const p = uri.fsPath;
      try {
        const st = await fs.promises.stat(p);
        if (st.size > MAX_FILE_BYTES) continue;
        const lines = (await fs.promises.readFile(p, 'utf8')).split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (!re.test(lines[i])) continue;
          results.push({ path: p, line: i + 1, text: lines[i] });
          if (results.length >= MAX_MATCHES) { results.capped = true; return results; }
        }
      } catch (_) {
        // Unreadable file (deleted, locked, permission): skip it.
      }
    }
  }
  return results;
}

module.exports = { createVscodeNavDeps };
