// Turns live CLI stream-json lines into the small set of UI events the webview renders
// (src/history/transcript-events.js makes the same events from a transcript).
// Pure: no vscode, so it is unit-tested directly.
//
// UI events:
//   {kind:'session', sessionId, model, permissionMode, cwd}
//   {kind:'delta', key, blockType:'text'|'thinking', text}       streamed piece of a block
//   {kind:'block', key, blockType:'text'|'thinking', text}       final full text of a block
//   {kind:'tool', key, id, name, input, final}                    a tool call (final has full input)
//   {kind:'toolResult', toolUseId, text, isError}
//   {kind:'user', key, text}                                      a user message (transcripts only)
//   {kind:'result', isError, errorText, durationMs, costUsd, inputTokens, outputTokens}
//   {kind:'status', status}

const { toolResultEvents } = require('../cli/content');

function resultEvent(msg) {
  const usage = msg.usage || {};
  const input = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  return {
    kind: 'result',
    isError: msg.is_error === true || msg.subtype !== 'success',
    errorText: msg.is_error ? String(msg.result || (msg.errors || []).join('\n') || msg.subtype) : '',
    durationMs: msg.duration_ms,
    costUsd: msg.total_cost_usd,
    inputTokens: input || undefined,
    outputTokens: usage.output_tokens || undefined,
  };
}

function createStreamTranslator() {
  // msgId -> [{index, type, finalized}] for the blocks we streamed, so the final `assistant`
  // line updates the same UI block instead of adding a duplicate.
  const streamed = new Map();
  let currentMsgId = null;
  let extra = 0;

  function claimKey(msgId, type) {
    for (const id of [msgId, currentMsgId]) {
      const list = id && streamed.get(id);
      const entry = list && list.find((b) => b.type === type && !b.finalized);
      if (entry) {
        entry.finalized = true;
        return `${id}:${entry.index}`;
      }
    }
    return `${msgId || 'm'}:f${extra++}`;
  }

  function onStreamEvent(ev) {
    switch (ev.type) {
      case 'message_start':
        currentMsgId = (ev.message && ev.message.id) || `local-${extra++}`;
        streamed.set(currentMsgId, []);
        return [];
      case 'content_block_start': {
        const block = ev.content_block || {};
        const list = streamed.get(currentMsgId);
        if (!list) return [];
        const type = block.type === 'redacted_thinking' ? 'thinking' : block.type;
        list.push({ index: ev.index, type, finalized: false });
        const key = `${currentMsgId}:${ev.index}`;
        if (type === 'tool_use') return [{ kind: 'tool', key, id: block.id, name: block.name, input: {}, final: false }];
        return [];
      }
      case 'content_block_delta': {
        const d = ev.delta || {};
        const key = `${currentMsgId}:${ev.index}`;
        if (d.type === 'text_delta') return [{ kind: 'delta', key, blockType: 'text', text: d.text }];
        if (d.type === 'thinking_delta') return [{ kind: 'delta', key, blockType: 'thinking', text: d.thinking }];
        return [];
      }
      default:
        return [];
    }
  }

  function onAssistant(message) {
    // CLI-made messages ("Not logged in", API errors) repeat in the `result` line that follows.
    if (message.model === '<synthetic>') return [];
    const out = [];
    for (const block of message.content || []) {
      if (block.type === 'text') {
        out.push({ kind: 'block', key: claimKey(message.id, 'text'), blockType: 'text', text: block.text || '' });
      } else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
        out.push({ kind: 'block', key: claimKey(message.id, 'thinking'), blockType: 'thinking', text: block.thinking || '' });
      } else if (block.type === 'tool_use') {
        out.push({ kind: 'tool', key: claimKey(message.id, 'tool_use'), id: block.id, name: block.name, input: block.input || {}, final: true });
      }
    }
    return out;
  }

  return function translate(msg) {
    // Sub-agent traffic (Task tool) is nested under its tool call; this milestone shows only the top level.
    if (msg.parent_tool_use_id) return [];
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          return [{ kind: 'session', sessionId: msg.session_id, model: msg.model, permissionMode: msg.permissionMode, cwd: msg.cwd }];
        }
        if (msg.subtype === 'status' && msg.status) return [{ kind: 'status', status: msg.status }];
        return [];
      case 'stream_event':
        return onStreamEvent(msg.event || {});
      case 'assistant':
        return onAssistant(msg.message || {});
      case 'user': {
        const content = msg.message && msg.message.content;
        return Array.isArray(content) ? toolResultEvents(content) : [];
      }
      case 'result':
        return [resultEvent(msg)];
      default:
        return [];
    }
  };
}

module.exports = { createStreamTranslator };
