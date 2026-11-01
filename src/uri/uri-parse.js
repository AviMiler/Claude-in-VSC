// Pure: reads `vscode://local.claude-local/open?prompt=...&session=...` into {prompt, session}.
// The prompt is only ever placed in the input box (after the user confirms); it is never sent.

const PROMPT_MAX = 8000;
const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;

function parseOpenUri(path, query) {
  if (path !== '/open') return { error: 'unknown-path' };
  const params = new URLSearchParams(query || '');
  const prompt = (params.get('prompt') || '').slice(0, PROMPT_MAX);
  const rawSession = params.get('session') || '';
  const session = SESSION_RE.test(rawSession) ? rawSession : '';
  if (rawSession && !session) return { error: 'bad-session' };
  return { prompt, session };
}

// A short preview for the confirmation dialog.
function previewPrompt(prompt, max = 400) {
  const flat = prompt.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

module.exports = { parseOpenUri, previewPrompt, PROMPT_MAX };
