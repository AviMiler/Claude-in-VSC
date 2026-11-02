// URI handler: vscode://local.claude-local/open?prompt=...&session=...
// Asks the user before anything is placed; the text goes into the input box and is never sent.
const vscode = require('vscode');
const { parseOpenUri, previewPrompt } = require('./uri-parse');

const CONFIRM = 'הנחת הטקסט בתיבה';

async function handleUri(uri, services) {
  const parsed = parseOpenUri(uri.path, uri.query);
  if (parsed.error || (!parsed.prompt && !parsed.session)) {
    services.logger.warn('uri', `ignored ${uri.path} (${parsed.error || 'empty'})`);
    return;
  }
  services.logger.info('uri', `received ${uri.path} (prompt ${parsed.prompt ? parsed.prompt.length : 0} chars, session ${parsed.session || 'none'})`);
  const lines = ['קישור חיצוני מבקש לפתוח את Claude Code Local.'];
  if (parsed.session) lines.push(`שיחה: ${parsed.session}`);
  if (parsed.prompt) lines.push(`טקסט שיונח בתיבה (לא יישלח אוטומטית):\n${previewPrompt(parsed.prompt)}`);
  const answer = await vscode.window.showWarningMessage(lines.join('\n\n'), { modal: true }, CONFIRM);
  services.logger.info('uri', `user ${answer === CONFIRM ? 'confirmed' : 'declined'}`);
  if (answer !== CONFIRM) return;

  // The same placement rule as every other entry point (src/panels/places.js).
  const host = await services.places.main();
  const conversation = parsed.session ? host.openSession(parsed.session) : host.current || host.newConversation();
  if (parsed.prompt) conversation.prefill(parsed.prompt);
}

function register(context, services) {
  context.subscriptions.push(vscode.window.registerUriHandler({ handleUri: (uri) => handleUri(uri, services) }));
}

module.exports = { register };
