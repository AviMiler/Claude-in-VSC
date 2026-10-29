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

// Text the CLI injects into the transcript as a "user" message but the user never typed.
function isInjectedText(text) {
  return /^\s*<(system-reminder|local-command-stdout|local-command-stderr|command-message)\b/.test(text)
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

// The text a user actually typed in a user message ('' when it holds only tool results or
// injected context).
function userTextFromEntry(content) {
  const parts = typeof content === 'string'
    ? [content]
    : (content || []).filter((b) => b.type === 'text').map((b) => b.text);
  const texts = [];
  for (const t of parts) {
    if (!t) continue;
    const cmd = commandText(t);
    if (cmd) texts.push(cmd);
    else if (!isInjectedText(t)) texts.push(t);
  }
  return texts.join('\n\n');
}

module.exports = { toolResultEvents, userTextFromEntry };
