// Entry point: builds the shared services and wires each feature. No feature logic lives here.
const vscode = require('vscode');
const { createLogger } = require('./src/util/logger');
const { createSettings } = require('./src/util/settings');
const { supportsSecondarySidebar } = require('./src/util/vscode-version');
const { createRegistry } = require('./src/panels/panel-registry');
const panels = require('./src/panels');

let services;

// Names and flags only: environment values and model denylist contents stay out of the log.
function describeSettings(s) {
  const d = s.display || {};
  return `claudePath=${s.claudePath} bypass=${s.allowDangerouslySkipPermissions} terminal=${s.useTerminal} location=${s.preferredLocation} envNames=[${Object.keys(s.environmentVariables || {}).join(',')}] gatewayUrl=${s.gatewayUrl ? 'set' : 'unset'} denylist=${s.modelDenylist.length} focusView=${d.focusView} timestamps=${d.showMessageTimestamps} colorMode=${d.colorMode}`;
}

function activate(context) {
  const logger = createLogger();
  const settings = createSettings();
  const registry = createRegistry();
  services = { logger, settings, registry, extensionUri: context.extensionUri };
  context.subscriptions.push(logger, settings);

  vscode.commands.executeCommand('setContext', 'claude-local:doesNotSupportSecondarySidebar', !supportsSecondarySidebar());

  panels.register(context, services);
  require('./src/uri').register(context, services);
  logger.info('settings', `activated (VS Code ${vscode.version}); ${describeSettings(settings.get())}`);
  context.subscriptions.push(settings.onDidChange((s) => logger.info('settings', `changed: ${describeSettings(s)}`)));
}

function deactivate() {
  if (services) services.registry.disposeAll();
}

module.exports = { activate, deactivate };
