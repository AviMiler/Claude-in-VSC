// Pure: background tasks (Bash with run_in_background, background sub-agents) from the CLI's
// `system` lines, captured in probe4 (DEPENDENCIES.md): `task_started`, `background_tasks_changed
// {tasks}`, `task_updated {patch:{status}}`, `task_notification {status, summary}`. Stop is the
// `stop_task {task_id}` control request. The CLI has no request that moves a running foreground
// tool to the background, so there is no "move to background" here.

const TASK_SUBTYPES = new Set(['task_started', 'background_tasks_changed', 'task_updated', 'task_notification']);

function createTaskMap() {
  return { tasks: new Map() }; // task_id -> { id, type, description, backgrounded, running, status, summary }
}

function upsert(map, id, fields) {
  const prev = map.tasks.get(id) || { id, type: '', description: '', backgrounded: false, running: true, status: 'running', summary: '' };
  const next = { ...prev };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) next[k] = v;
  map.tasks.set(id, next);
}

// Applies one CLI line; returns true when the map changed.
function applyMessage(map, msg) {
  if (!msg || msg.type !== 'system' || !TASK_SUBTYPES.has(msg.subtype)) return false;
  switch (msg.subtype) {
    case 'task_started':
      if (!msg.task_id) return false;
      upsert(map, msg.task_id, { type: msg.task_type, description: msg.description, backgrounded: msg.is_backgrounded === true, running: true, status: 'running' });
      return true;
    case 'background_tasks_changed': {
      // The full list of running background tasks: listed ones are running and backgrounded,
      // tasks that dropped out of it are no longer running.
      const listed = new Set();
      for (const t of Array.isArray(msg.tasks) ? msg.tasks : []) {
        if (!t || !t.task_id) continue;
        listed.add(t.task_id);
        upsert(map, t.task_id, { type: t.task_type, description: t.description, backgrounded: true, running: true });
      }
      for (const t of map.tasks.values()) if (t.backgrounded && !listed.has(t.id) && t.running) upsert(map, t.id, { running: false });
      return true;
    }
    case 'task_updated': {
      const status = msg.patch && msg.patch.status;
      if (!msg.task_id || !status) return false;
      upsert(map, msg.task_id, { status, running: status === 'running' });
      return true;
    }
    case 'task_notification':
      if (!msg.task_id) return false;
      upsert(map, msg.task_id, { status: msg.status, summary: typeof msg.summary === 'string' ? msg.summary : undefined, running: false });
      return true;
    default:
      return false;
  }
}

// Background tasks for the webview's bar: running ones first, then finished ones.
function backgroundTasks(map) {
  return [...map.tasks.values()]
    .filter((t) => t.backgrounded)
    .sort((a, b) => Number(b.running) - Number(a.running));
}

module.exports = { createTaskMap, applyMessage, backgroundTasks };
