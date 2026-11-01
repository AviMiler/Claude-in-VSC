// Pure log helpers: redaction, line format, level filter and a bounded ring buffer (no vscode here).
const MAX_LINE = 500;
const MAX_LINES = 2000;
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b[A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|AUTH)[A-Z0-9_]*\s*[=:]\s*\S+/g,
];

// One line, secrets masked, long text cut.
function redact(text) {
  let out = String(text).replace(/\s*[\r\n]+\s*/g, ' ');
  for (const re of SECRET_PATTERNS) out = out.replace(re, '***');
  return out.length > MAX_LINE ? `${out.slice(0, MAX_LINE)}… (${out.length} chars)` : out;
}

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

function timestamp(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function formatLine(date, level, tag, msg) {
  const mark = level === 'warn' ? ' WARN' : level === 'error' ? ' ERROR' : '';
  return `${timestamp(date)}${mark} [${tag}] ${redact(msg)}`;
}

// `setting` is claudeLocal.logLevel: 'info' (default) hides debug lines, 'debug' shows all.
function shouldLog(level, setting) {
  const min = setting === 'debug' ? LEVELS.debug : LEVELS.info;
  return (LEVELS[level] ?? LEVELS.info) >= min;
}

function createBuffer(max = MAX_LINES) {
  const lines = [];
  return {
    push(line) {
      lines.push(line);
      if (lines.length > max) lines.shift();
    },
    text: () => lines.join('\n'),
    size: () => lines.length,
  };
}

module.exports = { redact, formatLine, shouldLog, createBuffer, MAX_LINE, MAX_LINES };
