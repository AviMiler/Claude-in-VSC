// Pure logic for the conversations drawer, the place markers and the closed list. No vscode, no I/O.
// Status of an open conversation: "waiting" = a permission or question waits for the user,
// "running" = a turn is in progress, "unread" = a turn ended while it was not shown, "idle" = the rest.

const MARK_WAITING = '🔵';
const MARK_FINISHED = '🟠';
const CLOSED_MAX = 10;
const TITLE_FALLBACK = 'שיחה חדשה';

function conversationStatus({ busy, waiting, unread }) {
  if (waiting) return 'waiting';
  if (busy) return 'running';
  if (unread) return 'unread';
  return 'idle';
}

// c: {id, sessionId, title, busy, pending (Map), unread}. One row of the drawer's "open" section.
function conversationRow(c, currentId) {
  return {
    id: c.id,
    sessionId: c.sessionId || null,
    title: c.title || TITLE_FALLBACK,
    status: conversationStatus({ busy: c.busy, waiting: c.pending.size > 0, unread: c.unread }),
    current: c.id === currentId,
  };
}

// The marker of a place (tab title emoji, view badge): only conversations the user cannot see count.
function hiddenAttention(rows, shownId) {
  let waiting = 0;
  let unread = 0;
  for (const r of rows) {
    if (r.id === shownId) continue;
    if (r.status === 'waiting') waiting += 1;
    else if (r.status === 'unread') unread += 1;
  }
  return { waiting, unread, state: waiting ? 'waiting' : unread ? 'finished' : null };
}

function decorateTitle(base, state) {
  if (state === 'waiting') return `${MARK_WAITING} ${base}`;
  if (state === 'finished') return `${MARK_FINISHED} ${base}`;
  return base;
}

// In-memory list of recently closed conversations (newest last); the same session is kept once.
function pushClosed(list, entry) {
  if (!entry || !entry.sessionId) return list;
  const next = list.filter((e) => e.sessionId !== entry.sessionId);
  next.push(entry);
  return next.slice(-CLOSED_MAX);
}

module.exports = {
  MARK_WAITING, MARK_FINISHED, CLOSED_MAX, TITLE_FALLBACK,
  conversationStatus, conversationRow, hiddenAttention, decorateTitle, pushClosed,
};
