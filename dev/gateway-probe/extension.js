// Dev-only: checks that the VS Code extension host can reach the model gateway.
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runProbe, formatReport } = require('./probe');

function activate(context) {
  const out = vscode.window.createOutputChannel('Gateway Probe');
  context.subscriptions.push(out);
  context.subscriptions.push(vscode.commands.registerCommand('gatewayProbe.run', async () => {
    const cfg = vscode.workspace.getConfiguration('gatewayProbe');
    const http = vscode.workspace.getConfiguration('http');
    const extra = {
      vscode: vscode.version,
      uiKind: vscode.env.uiKind === vscode.UIKind.Desktop ? 'desktop' : 'web',
      remoteName: vscode.env.remoteName || null,
      httpProxy: (http.get('proxy') || '').replace(/\/\/[^@\/]+@/, '//***@'),
      httpProxySupport: http.get('proxySupport'),
      httpProxyStrictSSL: http.get('proxyStrictSSL'),
    };
    out.show(true);
    out.appendLine('Running gateway probe from the extension host ...');
    const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Gateway Probe' }, () =>
      runProbe({ baseUrl: cfg.get('baseUrl'), apiKey: cfg.get('apiKey'), model: cfg.get('model'), extra }));
    const file = path.join(os.tmpdir(), 'gateway-probe-result-extension-host.json');
    fs.writeFileSync(file, JSON.stringify(r, null, 2));
    const text = formatReport(r);
    out.appendLine(text);
    out.appendLine('\nFull result: ' + file);
    const failed = r.results.filter((e) => !e.http.ok).length;
    const pick = await vscode.window.showInformationMessage(
      'Gateway Probe: ' + (r.results.length - failed) + '/' + r.results.length + ' OK. Full result: ' + file,
      'Copy summary', 'Open full result');
    if (pick === 'Copy summary') await vscode.env.clipboard.writeText(text);
    if (pick === 'Open full result') await vscode.window.showTextDocument(vscode.Uri.file(file));
  }));
}
function deactivate() {}
module.exports = { activate, deactivate };
