// Display and accessibility settings (package G): reads the `claudeLocal.*` values the webview needs
// to render. Pure apart from the `get` function it is given, so it is testable without VS Code.

const COLOR_MODES = ['default', 'daltonized'];
const MAX_VERBS = 50;
const MAX_VERB_LENGTH = 40;

function sanitizeVerbs(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const text = v.replace(/\s+/g, ' ').trim().replace(/…+$/, '');
    if (text) out.push(text.slice(0, MAX_VERB_LENGTH));
    if (out.length >= MAX_VERBS) break;
  }
  return out;
}

// Lines above which a user message is collapsed: a whole number 0-200 (0 = never), default 8.
function sanitizeLines(value) {
  return Number.isInteger(value) && value >= 0 && value <= 200 ? value : 8;
}

// Font size in px: a number 8-32 (rounded to .5), else 0 = follow VS Code.
function sanitizeFontSize(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 8 || value > 32) return 0;
  return Math.round(value * 2) / 2;
}

// `get(name)` returns the raw configuration value (undefined when unset).
function readDisplay(get) {
  return {
    focusView: get('focusView') === true,
    showMessageTimestamps: get('showMessageTimestamps') === true,
    spinnerVerbs: sanitizeVerbs(get('spinnerVerbs')),
    scrollToBottomOnSend: get('scrollToBottomOnSend') !== false,
    prefersReducedMotion: get('prefersReducedMotion') === true,
    colorMode: COLOR_MODES.includes(get('colorMode')) ? get('colorMode') : 'default',
    collapseUserMessageLines: sanitizeLines(get('collapseUserMessageLines')),
    chatFontSize: sanitizeFontSize(get('chatFontSize')),
    codeFontSize: sanitizeFontSize(get('codeFontSize')),
  };
}

module.exports = { readDisplay, sanitizeVerbs, sanitizeFontSize, sanitizeLines, COLOR_MODES };
