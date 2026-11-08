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
  dismissEditorContext: (c, m) => c.dismissEditorContext(m.which === 'lines' ? 'lines' : 'file'),
  openFile: (c, m) => c.openFile(String(m.path), m.line),
  pickWorkFile: (c) => c.pickWorkFile(),
  mentionSearch: (c, m) => c.mentionSearch(String(m.query || ''), m.seq),
  planCommand: (c, m) => c.planCommand(m.open === true),
  diffCommand: (c) => c.diffCommand(),
  btw: (c, m) => c.btwCommand(String(m.id || ''), String(m.question || '')),
  btwCancel: (c, m) => c.btwCancel(String(m.id || '')),
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

function routeMessage(conversation, msg) {
  const route = msg && ROUTES[msg.type];
  if (route) route(conversation, msg);
  else conversation.services.logger.warn('control', `unknown webview message: ${msg && msg.type}`);
}

module.exports = { routeMessage };
