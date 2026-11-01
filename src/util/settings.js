// Reads claudeLocal.* settings and notifies listeners when any of them changes.
const vscode = require('vscode');

const { sanitizeEnvironmentVariables } = require('../cli/env');
const { readDisplay } = require('../panels/display-settings');

const SECTION = 'claudeLocal';

function read() {
  const c = vscode.workspace.getConfiguration(SECTION);
  return {
    claudePath: c.get('claudePath') || 'claude',
    allowDangerouslySkipPermissions: c.get('allowDangerouslySkipPermissions') === true,
    useCtrlEnterToSend: c.get('useCtrlEnterToSend') === true,
    environmentVariables: sanitizeEnvironmentVariables(c.get('environmentVariables')),
    preferredLocation: c.get('preferredLocation') === 'sidebar' ? 'sidebar' : 'panel',
    lockEditorGroups: c.get('lockEditorGroups') === true,
    useTerminal: c.get('useTerminal') === true,
    respectGitIgnore: c.get('respectGitIgnore') !== false,
    display: readDisplay((name) => c.get(name)),
    keybindings: {
      send: c.get('keybindings.send'),
      newLine: c.get('keybindings.newLine'),
      rewind: c.get('keybindings.rewind'),
    },
  };
}

function createSettings() {
  const listeners = new Set();
  const sub = vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration(SECTION)) return;
    const current = read();
    for (const fn of listeners) fn(current, e);
  });
  return {
    get: read,
    onDidChange(fn) {
      listeners.add(fn);
      return { dispose: () => listeners.delete(fn) };
    },
    dispose: () => sub.dispose(),
  };
}

module.exports = { createSettings, SECTION };
