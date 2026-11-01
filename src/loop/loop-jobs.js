// Pure: the session's scheduled `/loop` jobs from Claude's cron tool calls, in the shapes probe4
// captured (DEPENDENCIES.md row 38): CronCreate {cron, prompt, recurring} -> result {id,
// humanSchedule, recurring, durable}; CronList {} -> {jobs: [{id, cron, humanSchedule, prompt,
// recurring, durable}]}; CronDelete {id} -> {id}. The jobs are session-only ("dies when Claude
// exits"), so a new CLI process starts with none. The CLI reports no next-run time; the webview
// computes it from `cron` (webview/chat/cron-next.js).

const CRON_TOOLS = new Set(['CronCreate', 'CronList', 'CronDelete']);
const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;

function createLoopJobs() {
  return { calls: new Map(), jobs: new Map() }; // tool_use id -> {name, input}; job id -> job
}

function structuredResult(msg, blocks) {
  if (blocks.length !== 1) return null;
  const r = msg.tool_use_result || msg.toolUseResult;
  return r && typeof r === 'object' ? r : null;
}

function contentText(content) {
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map((b) => (b && b.text) || '').join('') : '';
}

function job(fields, createdAt) {
  return {
    id: String(fields.id),
    cron: String(fields.cron || ''),
    humanSchedule: String(fields.humanSchedule || ''),
    prompt: String(fields.prompt || ''),
    recurring: fields.recurring !== false,
    createdAt,
  };
}

function onResult(state, call, block, result, now) {
  const { name, input } = call;
  if (name === 'CronCreate') {
    // "Scheduled recurring job 25d4f4ac (Every minute)." is the text form of the same result.
    const match = /job (\S+?) \(/.exec(contentText(block.content));
    const id = (result && result.id) || (match && match[1]);
    if (!id || !JOB_ID.test(String(id))) return false;
    state.jobs.set(String(id), job({ ...input, ...(result || {}), id }, now));
    return true;
  }
  if (name === 'CronDelete') {
    const id = String((result && result.id) || input.id || '');
    return state.jobs.delete(id);
  }
  if (name === 'CronList' && result && Array.isArray(result.jobs)) {
    const next = new Map();
    for (const j of result.jobs) {
      if (!j || !JOB_ID.test(String(j.id))) continue;
      const prev = state.jobs.get(String(j.id));
      next.set(String(j.id), job(j, prev ? prev.createdAt : now));
    }
    state.jobs = next;
    return true;
  }
  return false;
}

// Applies one raw CLI line; returns true when the job list changed. Sub-agent traffic is skipped.
function applyMessage(state, msg, now = Date.now()) {
  if (!msg || msg.parent_tool_use_id) return false;
  const content = msg.message && msg.message.content;
  if (!Array.isArray(content)) return false;
  if (msg.type === 'assistant') {
    for (const b of content) {
      if (b && b.type === 'tool_use' && CRON_TOOLS.has(b.name)) state.calls.set(b.id, { name: b.name, input: b.input || {} });
    }
    return false;
  }
  if (msg.type !== 'user') return false;
  const blocks = content.filter((b) => b && b.type === 'tool_result' && state.calls.has(b.tool_use_id));
  let changed = false;
  for (const block of blocks) {
    const call = state.calls.get(block.tool_use_id);
    state.calls.delete(block.tool_use_id);
    if (!block.is_error && onResult(state, call, block, structuredResult(msg, blocks), now)) changed = true;
  }
  return changed;
}

function listJobs(state) {
  return [...state.jobs.values()];
}

// The text the stop button sends: the CLI has no control request that cancels a job, so Claude
// is asked to run CronDelete itself (whether a model always complies is unverified).
function stopPrompt(id) {
  return JOB_ID.test(String(id)) ? `Run CronDelete with id ${id} to cancel the scheduled loop job. Do nothing else.` : null;
}

module.exports = { createLoopJobs, applyMessage, listJobs, stopPrompt, JOB_ID };
