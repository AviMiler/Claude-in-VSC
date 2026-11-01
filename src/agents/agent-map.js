// Pure: one card per sub-agent call (the `Agent` tool, also listed as `Task`), fed with raw CLI
// lines. Formats captured in probe4 (DEPENDENCIES.md row 37): the sub-agent's own lines carry
// `parent_tool_use_id`; `system/task_started` (`task_type` local_agent, `subagent_type`,
// `spawn_depth`, `is_backgrounded`), `task_progress {usage, last_tool_name}`, `task_updated
// {patch:{status}}` and `task_notification {status, summary, usage}` carry the Agent call's
// `tool_use_id`. The final Agent tool_result can be "(no content)" while the summary is only in
// `task_notification`. Live only: cards are not rebuilt from transcripts.

const AGENT_TOOLS = new Set(['Agent', 'Task']);
const NO_CONTENT = '(no content)';
const INPUT_TEXT_MAX = 200;
const TOOLS_MAX = 200; // per card, so a runaway sub-agent cannot grow the webview without bound
const DONE_STATES = { completed: 'done', failed: 'error', killed: 'stopped', stopped: 'stopped' };

function createAgentMap() {
  // cards: Agent tool_use id -> card; owner: any tool_use id inside a card -> that card's id
  // (so a nested sub-agent's lines land in the root card).
  return { cards: new Map(), owner: new Map() };
}

// Only short string fields of a sub-agent tool's input go to the webview (for its one-line summary).
function shortInput(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (typeof v === 'string') out[k] = v.length > INPUT_TEXT_MAX ? `${v.slice(0, INPUT_TEXT_MAX)}…` : v;
  }
  return out;
}

function contentText(content) {
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map((b) => (b && b.type === 'text' && b.text) || '').join('') : '';
}

function newCard(block) {
  const input = block.input || {};
  return {
    id: block.id,
    description: String(input.description || ''),
    subagentType: String(input.subagent_type || ''),
    background: input.run_in_background === true,
    state: 'running',
    taskId: '',
    depth: 1,
    tools: [],
    lastTool: '',
    toolUses: 0,
    durationMs: undefined,
    notificationSummary: '',
    resultText: '',
  };
}

function cardFor(map, id) {
  const root = map.owner.get(id);
  return root ? map.cards.get(root) : undefined;
}

function onAssistant(map, msg, content) {
  let changed = false;
  for (const b of content) {
    if (!b || b.type !== 'tool_use' || !b.id) continue;
    if (!msg.parent_tool_use_id) {
      if (!AGENT_TOOLS.has(b.name) || map.cards.has(b.id)) continue;
      map.cards.set(b.id, newCard(b));
      map.owner.set(b.id, b.id);
      changed = true;
      continue;
    }
    const card = cardFor(map, msg.parent_tool_use_id);
    if (!card || map.owner.has(b.id)) continue;
    map.owner.set(b.id, card.id);
    if (card.tools.length < TOOLS_MAX) card.tools.push({ id: b.id, name: String(b.name || ''), input: shortInput(b.input), state: 'running' });
    changed = true;
  }
  return changed;
}

function onUser(map, msg, content) {
  let changed = false;
  for (const b of content) {
    if (!b || b.type !== 'tool_result') continue;
    if (!msg.parent_tool_use_id) {
      const card = map.cards.get(b.tool_use_id);
      if (!card) continue;
      card.resultText = contentText(b.content);
      // A background agent's call returns at once; the card ends with its task_notification.
      if (b.is_error) card.state = 'error';
      else if (!card.background && card.state === 'running') card.state = 'done';
      changed = true;
      continue;
    }
    const card = cardFor(map, msg.parent_tool_use_id);
    const tool = card && card.tools.find((t) => t.id === b.tool_use_id);
    if (!tool) continue;
    tool.state = b.is_error ? 'err' : 'ok';
    changed = true;
  }
  return changed;
}

function cardByTask(map, msg) {
  const byTool = msg.tool_use_id && map.cards.get(msg.tool_use_id);
  if (byTool) return byTool;
  return msg.task_id ? [...map.cards.values()].find((c) => c.taskId === msg.task_id) : undefined;
}

function applyUsage(card, usage) {
  if (!usage || typeof usage !== 'object') return;
  if (Number.isFinite(usage.tool_uses)) card.toolUses = usage.tool_uses;
  if (Number.isFinite(usage.duration_ms)) card.durationMs = usage.duration_ms;
}

function onSystem(map, msg) {
  const card = cardByTask(map, msg);
  if (!card) return false;
  switch (msg.subtype) {
    case 'task_started':
      if (msg.task_type && msg.task_type !== 'local_agent') return false;
      card.taskId = String(msg.task_id || card.taskId);
      if (msg.subagent_type) card.subagentType = String(msg.subagent_type);
      if (Number.isInteger(msg.spawn_depth)) card.depth = msg.spawn_depth;
      if (msg.is_backgrounded === true) card.background = true;
      return true;
    case 'task_progress':
      applyUsage(card, msg.usage);
      if (msg.last_tool_name) card.lastTool = String(msg.last_tool_name);
      return true;
    case 'task_updated': {
      const status = msg.patch && msg.patch.status;
      if (!DONE_STATES[status]) return false;
      card.state = DONE_STATES[status];
      return true;
    }
    case 'task_notification':
      applyUsage(card, msg.usage);
      if (typeof msg.summary === 'string') card.notificationSummary = msg.summary;
      card.state = DONE_STATES[msg.status] || 'done';
      return true;
    default:
      return false;
  }
}

// Applies one raw CLI line; returns the card ids it changed (empty when nothing did).
function applyMessage(map, msg) {
  if (!msg) return [];
  const before = new Map([...map.cards].map(([id, c]) => [id, JSON.stringify(c)]));
  let changed = false;
  if (msg.type === 'system') changed = onSystem(map, msg);
  else {
    const content = msg.message && msg.message.content;
    if (!Array.isArray(content)) return [];
    if (msg.type === 'assistant') changed = onAssistant(map, msg, content);
    else if (msg.type === 'user') changed = onUser(map, msg, content);
  }
  if (!changed) return [];
  return [...map.cards.keys()].filter((id) => before.get(id) !== JSON.stringify(map.cards.get(id)));
}

// The text to show as the sub-agent's answer: the notification summary, else the tool result,
// skipping the CLI's "(no content)" placeholder.
function displaySummary(card) {
  for (const s of [card.notificationSummary, card.resultText]) {
    const t = String(s || '').trim();
    if (t && t !== NO_CONTENT) return t;
  }
  return '';
}

// The card as the webview gets it.
function cardView(card) {
  return {
    id: card.id,
    description: card.description,
    subagentType: card.subagentType,
    background: card.background,
    state: card.state,
    depth: card.depth,
    tools: card.tools.map((t) => ({ ...t, input: { ...t.input } })),
    lastTool: card.lastTool,
    toolUses: card.toolUses,
    durationMs: card.durationMs,
    summary: displaySummary(card),
  };
}

function listCards(map, ids) {
  const list = ids ? ids.map((id) => map.cards.get(id)).filter(Boolean) : [...map.cards.values()];
  return list.map(cardView);
}

module.exports = { createAgentMap, applyMessage, displaySummary, listCards, AGENT_TOOLS };
