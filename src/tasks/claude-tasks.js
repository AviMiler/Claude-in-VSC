// Pure: Claude's own task list from its TaskCreate / TaskUpdate / TaskList tool calls (the CLI has
// no TodoWrite; formats captured in probe4, DEPENDENCIES.md). TaskCreate {subject, description}
// -> result {task: {id, subject}} ("Task #1 created successfully: ..."); TaskUpdate {taskId, status}
// -> {success, statusChange: {from, to}}; TaskList -> {tasks: [{id, subject, status}]}.
// A task changes only when its tool result arrives, so a denied or failed call changes nothing.

const TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate', 'TaskList']);
const STATUSES = new Set(['pending', 'in_progress', 'completed']);

function createClaudeTasks() {
  return { calls: new Map(), tasks: new Map() }; // tool_use id -> {name, input}; task id -> {id, subject, status}
}

function contentText(content) {
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map((b) => (b && b.text) || '').join('') : '';
}

// The structured result; the stream field name is taken defensively in both spellings.
function structuredResult(msg, blocks) {
  if (blocks.length !== 1) return null;
  const r = msg.tool_use_result || msg.toolUseResult;
  return r && typeof r === 'object' ? r : null;
}

function onResult(state, call, block, result) {
  const { name, input } = call;
  if (name === 'TaskCreate') {
    const match = /Task #(\S+) created/.exec(contentText(block.content));
    const id = (result && result.task && result.task.id) || (match && match[1]);
    if (!id) return false;
    const subject = (result && result.task && result.task.subject) || String(input.subject || '');
    state.tasks.set(String(id), { id: String(id), subject, status: 'pending' });
    return true;
  }
  if (name === 'TaskUpdate') {
    if (result && result.success === false) return false;
    const id = String(input.taskId || (result && result.taskId) || '');
    const status = (result && result.statusChange && result.statusChange.to) || input.status;
    if (!id || !STATUSES.has(status)) return false;
    const prev = state.tasks.get(id) || { id, subject: `#${id}`, status: 'pending' };
    state.tasks.set(id, { ...prev, status });
    return true;
  }
  if (name === 'TaskList' && result && Array.isArray(result.tasks)) {
    state.tasks = new Map(result.tasks.filter((t) => t && t.id !== undefined)
      .map((t) => [String(t.id), { id: String(t.id), subject: String(t.subject || ''), status: STATUSES.has(t.status) ? t.status : 'pending' }]));
    return true;
  }
  return false;
}

// Applies one raw CLI line; returns true when the list changed. Sub-agent traffic is skipped.
function applyMessage(state, msg) {
  if (!msg || msg.parent_tool_use_id) return false;
  const content = msg.message && msg.message.content;
  if (!Array.isArray(content)) return false;
  if (msg.type === 'assistant') {
    for (const b of content) {
      if (b && b.type === 'tool_use' && TASK_TOOLS.has(b.name)) state.calls.set(b.id, { name: b.name, input: b.input || {} });
    }
    return false;
  }
  if (msg.type !== 'user') return false;
  const blocks = content.filter((b) => b && b.type === 'tool_result' && state.calls.has(b.tool_use_id));
  let changed = false;
  for (const block of blocks) {
    const call = state.calls.get(block.tool_use_id);
    state.calls.delete(block.tool_use_id);
    if (!block.is_error && onResult(state, call, block, structuredResult(msg, blocks))) changed = true;
  }
  return changed;
}

function listTasks(state) {
  return [...state.tasks.values()];
}

module.exports = { createClaudeTasks, applyMessage, listTasks };
