// Buttons of the error card: open the user's settings.json or one extension setting.
const vscode = require('vscode');

const TARGETS = {
  json: () => vscode.commands.executeCommand('workbench.action.openSettingsJson'),
  claudePath: () => vscode.commands.executeCommand('workbench.action.openSettings', 'claudeLocal.claudePath'),
};

function openSettings(target) {
  const open = TARGETS[target];
  if (open) open();
}

module.exports = { openSettings };
