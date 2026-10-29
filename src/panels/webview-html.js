// Builds the chat webview HTML from webview/chat/index.html: fills in the CSP, the nonce and
// the resource URIs. Only webview/ and resources/ may be loaded.
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { nonce } = require('../util/nonce');

function webviewOptions(extensionUri) {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview'), vscode.Uri.joinPath(extensionUri, 'resources')],
  };
}

function chatHtml(webview, extensionUri) {
  const n = nonce();
  const root = vscode.Uri.joinPath(extensionUri, 'webview');
  const uri = (...p) => webview.asWebviewUri(vscode.Uri.joinPath(root, ...p)).toString();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${n}'`,
  ].join('; ');
  const template = fs.readFileSync(path.join(root.fsPath, 'chat', 'index.html'), 'utf8');
  return template
    .replace(/\{\{csp\}\}/g, csp)
    .replace(/\{\{nonce\}\}/g, n)
    .replace(/\{\{chat\}\}/g, uri('chat'))
    .replace(/\{\{vendor\}\}/g, uri('vendor'));
}

module.exports = { chatHtml, webviewOptions };
