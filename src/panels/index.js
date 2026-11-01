// The panels feature: the two places (sidebar view, editor tab), the placement rule, commands and
// the status-bar item.
const { registerCommands } = require('./commands');
const { createPlanDocs } = require('./plan-doc');
const { createDiffView } = require('../diff/diff-view');
const { registerSidebar } = require('./sidebar-view');
const { createPlaces } = require('./places');
const { registerStatusBar } = require('./status-bar');

function register(context, services) {
  services.planDocs = createPlanDocs();
  context.subscriptions.push(services.planDocs);
  services.diffView = createDiffView(); // shared: /diff now, package F and openDiff later
  context.subscriptions.push(services.diffView);
  const sidebarHost = registerSidebar(context, services);
  services.places = createPlaces(services, sidebarHost);
  services.openSession = registerCommands(context, services).openSession;
  registerStatusBar(context);
}

module.exports = { register };
