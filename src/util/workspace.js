// Where the CLI runs: the first workspace folder, else the home folder.
const os = require('os');
const vscode = require('vscode');

function workspaceCwd() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length ? { cwd: folders[0].uri.fsPath, noFolder: false } : { cwd: os.homedir(), noFolder: true };
}

module.exports = { workspaceCwd };
