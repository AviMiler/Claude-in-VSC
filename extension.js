// Entry point: builds the shared services and wires each feature. No feature logic lives here.
const vscode = require('vscode');
const { createLogger } = require('./src/util/logger');
const { createSettings } = require('./src/util/settings');
const { supportsSecondarySidebar } = require('./src/util/vscode-version');
const { createRegistry } = require('./src/panels/panel-registry');
const panels = require('./src/panels');

let services;

function activate(context) {
  const logger = createLogger();
  const settings = createSettings();
  const registry = createRegistry();
  services = { logger, settings, registry, extensionUri: context.extensionUri };
  context.subscriptions.push(logger, settings);

  vscode.commands.executeCommand('setContext', 'claude-local:doesNotSupportSecondarySidebar', !supportsSecondarySidebar());

  panels.register(context, services);
  logger.info(`activated (VS Code ${vscode.version})`);
}

function deactivate() {
  if (services) services.registry.disposeAll();
}

module.exports = { activate, deactivate };
