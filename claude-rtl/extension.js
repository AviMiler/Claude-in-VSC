const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const START = '/* CLAUDE-RTL-START */';
const END = '/* CLAUDE-RTL-END */';

// Per-block automatic direction by the first strong character; code stays LTR.
const CSS = `
${START}
p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, summary,
textarea, [contenteditable], [role="textbox"] {
  unicode-bidi: plaintext;
  text-align: start;
}
ul, ol { padding-inline-start: 1.5em; }
blockquote { border-inline-start: 3px solid currentColor; border-left: 0; padding-inline-start: 0.75em; }
pre, code, kbd, samp {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: left;
}
${END}
`;

function cssPath() {
  const id = vscode.workspace.getConfiguration('claudeRtl').get('extensionId');
  const ext = vscode.extensions.getExtension(id);
  if (!ext) return null;
  return path.join(ext.extensionPath, 'webview', 'index.css');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function stripBlock(text) {
  const re = new RegExp('\\n?' + escapeRe(START) + '[\\s\\S]*?' + escapeRe(END) + '\\n?', 'g');
  return text.replace(re, '\n');
}

// Returns 'applied' | 'already' | 'missing' | 'error'.
function apply() {
  const file = cssPath();
  if (!file || !fs.existsSync(file)) return 'missing';
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes(START)) return 'already';
    fs.writeFileSync(file, text.trimEnd() + '\n' + CSS, 'utf8');
    return 'applied';
  } catch (e) {
    vscode.window.showErrorMessage('Claude RTL: ' + e.message);
    return 'error';
  }
}

function remove() {
  const file = cssPath();
  if (!file || !fs.existsSync(file)) return 'missing';
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes(START)) return 'already';
    fs.writeFileSync(file, stripBlock(text).trimEnd() + '\n', 'utf8');
    return 'applied';
  } catch (e) {
    vscode.window.showErrorMessage('Claude RTL: ' + e.message);
    return 'error';
  }
}

async function offerReload(message) {
  const pick = await vscode.window.showInformationMessage(message, 'טעינה מחדש');
  if (pick) vscode.commands.executeCommand('workbench.action.reloadWindow');
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeRtl.enable', async () => {
      const r = apply();
      if (r === 'missing') return vscode.window.showWarningMessage('Claude RTL: התוסף הרשמי או הקובץ webview/index.css לא נמצאו.');
      if (r === 'error') return;
      await context.globalState.update('enabled', true);
      if (r === 'already') return vscode.window.showInformationMessage('Claude RTL: כבר פעיל.');
      offerReload('Claude RTL הופעל. צריך לטעון מחדש את החלון.');
    }),
    vscode.commands.registerCommand('claudeRtl.disable', async () => {
      const r = remove();
      if (r === 'missing') return vscode.window.showWarningMessage('Claude RTL: התוסף הרשמי לא נמצא.');
      if (r === 'error') return;
      await context.globalState.update('enabled', false);
      if (r === 'already') return vscode.window.showInformationMessage('Claude RTL: לא היה פעיל.');
      offerReload('Claude RTL בוטל. צריך לטעון מחדש את החלון.');
    })
  );

  // An update of the official extension replaces the file; re-apply if the user enabled it before.
  if (context.globalState.get('enabled', false) && vscode.workspace.getConfiguration('claudeRtl').get('autoApply')) {
    if (apply() === 'applied') offerReload('Claude RTL הוחל מחדש אחרי עדכון. לטעון מחדש?');
  }
}

function deactivate() {}
module.exports = { activate, deactivate };
