// Pure: validates the "add MCP server" form and builds `claude mcp add/remove` argument lists.
// Arguments reach cmd.exe when claudePath is a .cmd/.bat wrapper, so shell metacharacters are refused.

const NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const SCOPES = ['local', 'user', 'project'];
const TRANSPORTS = ['stdio', 'http', 'sse'];
const UNSAFE_RE = /[%^&|<>"`\r\n]/;

// Splits a command line on spaces; a double-quoted part keeps its spaces.
function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(line || '')))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

function parseEnvLines(text) {
  const env = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf('=');
    if (i < 1) return { error: `משתנה סביבה לא תקין: ${line}` };
    env.push([line.slice(0, i).trim(), line.slice(i + 1)]);
  }
  return { env };
}

// form: {name, scope, transport, target (command line or URL), env (KEY=VALUE per line)}
// Returns {args} or {error} (Hebrew).
function buildAddArgs(form) {
  const name = String(form.name || '').trim();
  if (!NAME_RE.test(name)) return { error: 'שם השרת: אותיות לטיניות, ספרות, נקודה, מקף וקו תחתון בלבד.' };
  const scope = SCOPES.includes(form.scope) ? form.scope : 'local';
  const transport = TRANSPORTS.includes(form.transport) ? form.transport : 'stdio';
  const target = tokenize(form.target);
  if (!target.length) return { error: transport === 'stdio' ? 'חסרה פקודת הפעלה.' : 'חסרה כתובת השרת.' };
  const parsed = parseEnvLines(form.env);
  if (parsed.error) return { error: parsed.error };
  const parts = [name, ...target, ...parsed.env.flat()];
  if (parts.some((p) => UNSAFE_RE.test(p))) return { error: 'אסור להשתמש בתווים % ^ & | < > ` או מרכאות בתוך ערך.' };
  if (transport !== 'stdio' && (target.length !== 1 || !/^https?:\/\//i.test(target[0]))) {
    return { error: 'כתובת השרת חייבת להתחיל ב-http:// או https:// ולהיות ערך בודד.' };
  }
  const args = ['mcp', 'add', '-s', scope];
  if (transport !== 'stdio') args.push('--transport', transport);
  for (const [k, v] of parsed.env) args.push('-e', `${k}=${v}`);
  args.push(name, '--', ...target);
  return { args };
}

function buildRemoveArgs(name, scope) {
  const n = String(name || '').trim();
  if (!NAME_RE.test(n)) return { error: 'שם שרת לא תקין.' };
  const args = ['mcp', 'remove', n];
  if (SCOPES.includes(scope)) args.push('-s', scope);
  return { args };
}

module.exports = { buildAddArgs, buildRemoveArgs, tokenize, parseEnvLines, NAME_RE, SCOPES, TRANSPORTS };
