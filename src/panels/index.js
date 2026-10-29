// The panels feature: editor tabs, sidebar views, commands and the status-bar item.
const { registerCommands } = require('./commands');
const { registerSidebar } = require('./sidebar-view');
const { registerStatusBar } = require('./status-bar');

function register(context, services) {
  registerCommands(context, services);
  registerSidebar(context, services);
  registerStatusBar(context);
}

module.exports = { register };
