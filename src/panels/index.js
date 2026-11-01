// The panels feature: editor tabs, sidebar views, commands and the status-bar item.
const { registerCommands } = require('./commands');
const { createPlanDocs } = require('./plan-doc');
const { registerHistory } = require('./history-tree');
const { registerSidebar } = require('./sidebar-view');
const { registerStatusBar } = require('./status-bar');

function register(context, services) {
  services.planDocs = createPlanDocs();
  context.subscriptions.push(services.planDocs);
  registerCommands(context, services);
  registerSidebar(context, services);
  registerHistory(context, services);
  registerStatusBar(context);
}

module.exports = { register };
