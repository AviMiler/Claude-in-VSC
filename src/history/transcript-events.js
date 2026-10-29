// Transcript entries (parsed jsonl lines) -> the same UI events the live stream produces
// (see src/panels/event-translator.js), so a past conversation renders like a live one.
const { toolResultEvents, userTextFromEntry } = require('../cli/content');

function translateTranscript(entries) {
  const out = [];
  for (const e of entries) {
    if (e.isSidechain || e.isMeta) continue;
    const content = e.message && e.message.content;
    if (e.type === 'user') {
      const text = userTextFromEntry(content);
      if (text) out.push({ kind: 'user', key: e.uuid, text });
      if (Array.isArray(content)) out.push(...toolResultEvents(content));
    } else if (e.type === 'assistant' && Array.isArray(content)) {
      if (e.message.model === '<synthetic>') {
        const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        if (text) out.push({ kind: 'result', isError: true, errorText: text });
        continue;
      }
      content.forEach((block, i) => {
        const key = `${e.uuid}:${i}`;
        if (block.type === 'text' && block.text) out.push({ kind: 'block', key, blockType: 'text', text: block.text });
        else if (block.type === 'thinking' && block.thinking) out.push({ kind: 'block', key, blockType: 'thinking', text: block.thinking });
        else if (block.type === 'tool_use') out.push({ kind: 'tool', key, id: block.id, name: block.name, input: block.input || {}, final: true });
      });
    }
  }
  return out;
}

module.exports = { translateTranscript };
