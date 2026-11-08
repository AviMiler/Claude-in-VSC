// The panels feature: the two places (sidebar view, editor tab), the placement rule, commands and
// the status-bar item.
const { registerCommands } = require('./commands');
const { createPlanDocs } = require('./plan-doc');
const { createDiffView } = require('../diff/diff-view');
const { createBlockReview } = require('../diff/block-review');
const { createEditorTracker } = require('./editor-context');
const { registerSidebar } = require('./sidebar-view');
const { createPlaces } = require('./places');
const { registerStatusBar } = require('./status-bar');
const { createBtwPanel } = require('./btw-panel');

function register(context, services) {
  services.planDocs = createPlanDocs();
  context.subscriptions.push(services.planDocs);
  services.diffView = createDiffView(); // shared: /diff, per-block review (package F), openDiff later
  context.subscriptions.push(services.diffView);
  services.blockReview = createBlockReview(services.diffView);
  context.subscriptions.push(services.blockReview);
  services.btwPanel = createBtwPanel(services); // /btw side panel (singleton, opened on demand)
  context.subscriptions.push(services.btwPanel);
  services.editorTracker = createEditorTracker(); // editor context chips (package F)
  context.subscriptions.push(services.editorTracker);
  require('../ide').register(context, services); // IDE server + lock file (needs the tracker)
  const sidebarHost = registerSidebar(context, services);
  services.places = createPlaces(services, sidebarHost);
  registerCommands(context, services);
  registerStatusBar(context);
}

module.exports = { register };
