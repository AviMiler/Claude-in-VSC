// Pure: the data of the Hebrew error card shown in the chat when the CLI fails to start or dies.
// The webview renders it (webview/chat/error-card.js); buttons map to `openSettings` targets.
const { resolveExecutable } = require('../cli/spawn');

const WRAPPER_RE = /\.(cmd|bat)$/i;

// The URL without credentials or query, so the card never shows a key embedded in it.
function safeUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return String(raw).slice(0, 80);
  }
}

function isWrapper(claudePath, env, platform = process.platform) {
  if (platform !== 'win32') return false;
  return WRAPPER_RE.test(resolveExecutable(claudePath, env, platform));
}

function buildErrorCard({ claudePath, env = {}, platform = process.platform }) {
  const baseUrl = safeUrl(env.ANTHROPIC_BASE_URL);
  const checks = [
    baseUrl
      ? `ANTHROPIC_BASE_URL מצביע על ${baseUrl} — ודאו שהכתובת נכונה.`
      : 'ANTHROPIC_BASE_URL לא מוגדר — אם אתם עובדים מול מודל מקומי, הגדירו אותו ב-claudeLocal.environmentVariables.',
    'ודאו ששרת המודל (השער) פועל ונגיש מהמחשב הזה.',
    `ודאו שההגדרה claudeLocal.claudePath נכונה (כרגע: ${claudePath}).`,
  ];
  const wrapper = isWrapper(claudePath, env, platform);
  return {
    title: 'Claude Code לא הצליח לפעול',
    checks,
    warning: wrapper
      ? 'claudePath מצביע על קובץ עטיפה (.cmd/.bat). העטיפה שואלת "Select model number" ונתקעת. הצביעו על claude-bin.exe.'
      : '',
    buttons: [
      ...(wrapper ? [{ label: 'פתיחת ההגדרה claudePath', target: 'claudePath' }] : []),
      { label: 'פתיחת settings.json', target: 'json' },
    ],
  };
}

module.exports = { buildErrorCard, isWrapper, safeUrl };
