// Webview -> host message table for the visible conversation. Each entry maps one `type` to a
// Conversation method; the drawer's messages (new, switch, close, rename, list) are the host's
// (conversation-host.js) and never reach this table.

const { handleMcp } = require('../mcp/mcp-handler');
const { openSettings } = require('./settings-actions');
const { WEBVIEW_TAGS } = require('../util/log-tags');

const ROUTES = {
  send: (c, m) => c.send(String(m.text || ''), m.images),
  dropUris: (c, m) => c.dropUris(m.uris),
  interrupt: (c) => c.interrupt(),
  setMode: (c, m) => c.setMode(String(m.value)),
  setModel: (c, m) => c.setModel(String(m.value)),
  stopAndSwitchModel: (c, m) => c.stopAndSwitchModel(String(m.value)),
  permissionAnswer: (c, m) => c.answerPermission(m),
  reviewBlocks: (c, m) => c.reviewBlocks(String(m.requestId)),
  fileChip: (c, m) => c.chipAction({ action: String(m.action || 'ack'), path: m.path ? String(m.path) : null }),
  mentionPicked: (c, m) => c.mentionPicked(String(m.path || ''), m.isDir === true),
  openFile: (c, m) => c.openFile(String(m.path), m.line),
  mentionSearch: (c, m) => c.mentionSearch(String(m.query || ''), m.seq),
  planCommand: (c, m) => c.planCommand(m.open === true),
  diffCommand: (c) => c.diffCommand(),
  openChangeDiff: (c, m) => c.openChangeDiff(String(m.path || '')),
  btwOpen: (c, m) => c.services.btwPanel.open(c.btwRunOptions(), String(m.question || '')),
  rewindMenu: (c) => c.rewindMenu(),
  stopTask: (c, m) => c.stopTask(String(m.id || '')),
  stopLoop: (c, m) => c.stopLoop(String(m.id || '')),
  openTerminal: (c) => c.openTerminal(),
  openLink: (c, m) => c.openLink(String(m.url)),
  mcp: (c, m) => handleMcp(c, m),
  openSettings: (_c, m) => openSettings(String(m.target)),
  // Webview events worth a log line (counts and names only, never message text).
  log: (c, m) => WEBVIEW_TAGS.includes(m.tag) && c.services.logger.info(m.tag, `ui: ${String(m.text).slice(0, 200)}`),
};

function logRouteFailure(conversation, msg, err) {
  conversation.services.logger.warn('control', `webview message ${msg.type} failed: ${err && err.message ? err.message : err}`);
}

function routeMessage(conversation, msg) {
  const route = msg && ROUTES[msg.type];
  if (route) {
    // Async handlers return promises the webview never awaits: log a rejection instead of leaving it unhandled.
    try {
      const result = route(conversation, msg);
      if (result && typeof result.catch === 'function') result.catch((err) => logRouteFailure(conversation, msg, err));
    } catch (err) {
      logRouteFailure(conversation, msg, err);
    }
  } else conversation.services.logger.warn('control', `unknown webview message: ${msg && msg.type}`);
}

module.exports = { routeMessage };
