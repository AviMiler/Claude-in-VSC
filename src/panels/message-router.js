// Webview -> host message table. Each entry maps one `type` to a Conversation method.

const ROUTES = {
  ready: (c) => c.onReady(),
  send: (c, m) => c.send(String(m.text || '')),
  interrupt: (c) => c.interrupt(),
  setMode: (c, m) => c.setMode(String(m.value)),
  setModel: (c, m) => c.setModel(String(m.value)),
  permissionAnswer: (c, m) => c.answerPermission(m),
  listHistory: (c) => c.listHistory(),
  openSession: (c, m) => c.openSession(String(m.id)),
  newConversation: (c) => c.newConversation(),
  openFile: (c, m) => c.openFile(String(m.path), m.line),
  openLink: (c, m) => c.openLink(String(m.url)),
};

function routeMessage(conversation, msg) {
  const route = msg && ROUTES[msg.type];
  if (route) route(conversation, msg);
  else conversation.services.logger.warn(`unknown webview message: ${msg && msg.type}`);
}

module.exports = { routeMessage };
