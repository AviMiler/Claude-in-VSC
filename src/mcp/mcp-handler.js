// The MCP dialog's host side: webview `mcp` messages -> control requests (status, reconnect,
// toggle) on the live CLI process, or `claude mcp add/remove` as a separate short-lived process.
const { mergeEnv } = require('../cli/env');
const { normalizeServers } = require('./mcp-model');
const { buildAddArgs, buildRemoveArgs } = require('./mcp-args');
const { runClaude } = require('./mcp-cli');

const NO_PROCESS = 'אין תהליך Claude פעיל בשיחה הזו. שלחו הודעה או פתחו שיחה חדשה ונסו שוב.';
const APPLY_NOTE = 'השינוי נשמר בהגדרות ה-CLI; הוא ייכנס לתוקף בשיחה חדשה.';

async function sendStatus(c) {
  if (!c.proc) return c.post({ type: 'mcpState', servers: [], error: NO_PROCESS });
  try {
    const res = await c.proc.request('mcp_status', {}, 20000);
    const servers = normalizeServers(res);
    c.services.logger.info('mcp', `status: ${servers.length} servers`);
    c.post({ type: 'mcpState', servers });
  } catch (err) {
    c.post({ type: 'mcpState', servers: [], error: `קריאת הסטטוס נכשלה: ${err.message}` });
  }
}

async function control(c, subtype, payload) {
  if (!c.proc) return c.post({ type: 'mcpResult', ok: false, text: NO_PROCESS });
  try {
    await c.proc.request(subtype, payload, 30000);
  } catch (err) {
    c.post({ type: 'mcpResult', ok: false, text: `ה-CLI סירב: ${err.message}` });
  }
  return sendStatus(c);
}

async function cliChange(c, built, doneText) {
  if (built.error) return c.post({ type: 'mcpResult', ok: false, text: built.error });
  const { claudePath, environmentVariables } = c.services.settings.get();
  c.post({ type: 'mcpResult', ok: true, text: 'מריץ…', pending: true });
  const res = await runClaude(claudePath, built.args, { cwd: c.cwd, env: mergeEnv(process.env, environmentVariables) });
  c.services.logger.info('mcp', `cli ${built.args[0] || ''} ${built.args[1] || ''} ok=${res.ok} timedOut=${Boolean(res.timedOut)}`);
  if (res.ok) c.post({ type: 'mcpResult', ok: true, text: `${doneText} ${APPLY_NOTE}` });
  else c.post({ type: 'mcpResult', ok: false, text: res.timedOut ? 'הפקודה לא הסתיימה בזמן.' : `הפקודה נכשלה: ${res.output || 'ללא פלט'}` });
  return sendStatus(c);
}

const ACTIONS = {
  status: (c) => sendStatus(c),
  reconnect: (c, m) => control(c, 'mcp_reconnect', { serverName: String(m.name) }),
  toggle: (c, m) => control(c, 'mcp_toggle', { serverName: String(m.name), enabled: m.enabled === true }),
  add: (c, m) => cliChange(c, buildAddArgs(m.form || {}), 'השרת נוסף.'),
  remove: (c, m) => cliChange(c, buildRemoveArgs(m.name, m.scope), 'השרת הוסר.'),
};

function handleMcp(conversation, msg) {
  const action = ACTIONS[msg.action];
  const logger = conversation.services.logger;
  logger.info('mcp', `action ${msg.action}${msg.name ? ` server=${msg.name}` : ''}`);
  if (action) action(conversation, msg).catch((err) => logger.warn('mcp', `${msg.action}: ${err.message}`));
}

module.exports = { handleMcp };
