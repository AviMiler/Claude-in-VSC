// Helpers for the CLI's message content blocks, shared by the live stream translator and the
// transcript reader (both see the same user/assistant message shapes).

function toolResultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => (c.type === 'text' ? c.text : c.type === 'image' ? '[תמונה]' : ''))
    .filter(Boolean)
    .join('\n');
}

function toolResultEvents(blocks) {
  return blocks
    .filter((b) => b && b.type === 'tool_result')
    .map((b) => ({
      kind: 'toolResult',
      toolUseId: b.tool_use_id,
      text: toolResultText(b.content),
      isError: b.is_error === true,
    }));
}

// Text the CLI injects into the transcript as a "user" message but the user never typed, and the
// editor-context blocks the extension sends in front of the user's text (src/tagging/chips.js).
function isInjectedText(text) {
  return /^\s*<(system-reminder|local-command-stdout|local-command-stderr|command-message|ide_opened_file|ide_selection)\b/.test(text)
    || /^\s*\[Request interrupted/.test(text)
    || /^Caveat: The messages below/.test(text);
}

// "<command-name>/foo</command-name><command-args>x</command-args>" -> "/foo x"
function commandText(text) {
  const name = /<command-name>([\s\S]*?)<\/command-name>/.exec(text);
  if (!name) return null;
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text);
  return `${name[1].trim()}${args && args[1].trim() ? ` ${args[1].trim()}` : ''}`;
}

// Until 2026-11-09 the editor context went inside the user's text block, in Hebrew: lines
// "[הקשר מהעורך] הקובץ: @p" / "התיקייה: @p", or "השורות שנבחרו: @p#5-10" followed by a fenced
// block, then a blank line and the user's text. Old transcripts still hold it: the bubble, the
// title and the rewind list show only what the user typed. Unrecognised text is returned as is.
const LEGACY_TAG = '[הקשר מהעורך] ';
const LEGACY_LINES = 'השורות שנבחרו:';
const FENCE_CLOSE = '\n```\n';

function stripLegacyContext(text) {
  let rest = text;
  while (rest.startsWith(LEGACY_TAG)) {
    const eol = rest.indexOf('\n');
    if (eol < 0) return text;
    const head = rest.slice(LEGACY_TAG.length, eol);
    rest = rest.slice(eol + 1);
    if (head.startsWith(LEGACY_LINES)) {
      if (!rest.startsWith('```')) return text;
      const close = rest.indexOf(FENCE_CLOSE, 3);
      if (close < 0) return text;
      rest = rest.slice(close + FENCE_CLOSE.length);
    }
  }
  return rest === text ? text : rest.replace(/^\n/, '');
}

// The text a user actually typed in a user message ('' when it holds only tool results or
// injected context).
function userTextFromEntry(content) {
  const parts = typeof content === 'string'
    ? [content]
    : (content || []).filter((b) => b && b.type === 'text').map((b) => b.text);
  const texts = [];
  for (const t of parts) {
    if (!t) continue;
    const cmd = commandText(t);
    if (cmd) texts.push(cmd);
    else if (!isInjectedText(t)) {
      const typed = stripLegacyContext(t);
      if (typed) texts.push(typed);
    }
  }
  return texts.join('\n\n');
}

module.exports = { toolResultEvents, userTextFromEntry, isInjectedText, stripLegacyContext };
