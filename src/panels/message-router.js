// Webview -> host message table. Each entry maps one `type` to a Conversation method.

const { handleMcp } = require('../mcp/mcp-handler');
const { openSettings } = require('./settings-actions');

const ROUTES = {
  ready: (c) => c.onReady(),
  send: (c, m) => c.send(String(m.text || ''), m.images),
  dropUris: (c, m) => c.dropUris(m.uris),
  interrupt: (c) => c.interrupt(),
  setMode: (c, m) => c.setMode(String(m.value)),
  setModel: (c, m) => c.setModel(String(m.value)),
  permissionAnswer: (c, m) => c.answerPermission(m),
  listHistory: (c) => c.listHistory(),
  openSession: (c, m) => c.openSession(String(m.id)),
  newConversation: (c) => c.newConversation(),
  openFile: (c, m) => c.openFile(String(m.path), m.line),
  mentionSearch: (c, m) => c.mentionSearch(String(m.query || ''), m.seq),
  planCommand: (c, m) => c.planCommand(m.open === true),
  openTerminal: (c) => c.openTerminal(),
  openLink: (c, m) => c.openLink(String(m.url)),
  mcp: (c, m) => handleMcp(c, m),
  openSettings: (_c, m) => openSettings(String(m.target)),
};

function routeMessage(conversation, msg) {
  const route = msg && ROUTES[msg.type];
  if (route) route(conversation, msg);
  else conversation.services.logger.warn(`unknown webview message: ${msg && msg.type}`);
}

module.exports = { routeMessage };
