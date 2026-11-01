// URI handler: vscode://local.claude-local/open?prompt=...&session=...
// Asks the user before anything is placed; the text goes into the input box and is never sent.
const vscode = require('vscode');
const { parseOpenUri, previewPrompt } = require('./uri-parse');
const { openChatPanel } = require('../panels/chat-panel');

const CONFIRM = 'הנחת הטקסט בתיבה';

async function handleUri(uri, services) {
  const parsed = parseOpenUri(uri.path, uri.query);
  if (parsed.error || (!parsed.prompt && !parsed.session)) {
    services.logger.warn(`ignored URI ${uri.path} (${parsed.error || 'empty'})`);
    return;
  }
  const lines = ['קישור חיצוני מבקש לפתוח את Claude Code Local.'];
  if (parsed.session) lines.push(`שיחה: ${parsed.session}`);
  if (parsed.prompt) lines.push(`טקסט שיונח בתיבה (לא יישלח אוטומטית):\n${previewPrompt(parsed.prompt)}`);
  const answer = await vscode.window.showWarningMessage(lines.join('\n\n'), { modal: true }, CONFIRM);
  if (answer !== CONFIRM) return;

  const { registry } = services;
  let entry = parsed.session ? registry.findBySession(parsed.session) : registry.lastTab();
  if (entry) entry.reveal();
  else entry = openChatPanel(services, { resume: parsed.session || undefined });
  if (parsed.prompt) entry.conversation.prefill(parsed.prompt);
}

function register(context, services) {
  context.subscriptions.push(vscode.window.registerUriHandler({ handleUri: (uri) => handleUri(uri, services) }));
}

module.exports = { register };
