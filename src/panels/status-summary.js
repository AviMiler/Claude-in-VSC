// What the status-bar item shows: working (with the turn timer), waiting for permission, or just finished.
// Pure (no VS Code): the item in status-bar.js feeds it the open conversations and the clock.

const FINISHED_MS = 8000; // how long "finished" stays after the last turn ends (an unread one stays until read)

function clock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// convs: objects with busy, pending (Map), unread. Remembers when each one started working.
function createStatusTracker() {
  const started = new Map(); // conversation -> ms when first seen busy
  let wasActive = false;
  let finishedAt = 0;

  return {
    // Returns { state: 'idle' | 'working' | 'waiting' | 'finished', text, tooltip } at time `now` (ms).
    update(convs, now) {
      for (const c of [...started.keys()]) if (!convs.includes(c) || !c.busy) started.delete(c);
      for (const c of convs) if (c.busy && !started.has(c)) started.set(c, now);
      const waiting = convs.filter((c) => c.pending && c.pending.size > 0);
      const busy = convs.filter((c) => c.busy);
      const active = waiting.length > 0 || busy.length > 0;
      if (wasActive && !active) finishedAt = now;
      wasActive = active;
      if (waiting.length) {
        return { state: 'waiting', text: '$(bell) Claude · ממתין לאישור', tooltip: 'Claude ממתין לאישור הרשאה. לחיצה פותחת את הצ\'אט.' };
      }
      if (busy.length) {
        const oldest = Math.min(...busy.map((c) => started.get(c)));
        const secs = Math.max(0, Math.floor((now - oldest) / 1000));
        const many = busy.length > 1 ? ` (${busy.length})` : '';
        return { state: 'working', text: `$(sync~spin) Claude · ${clock(secs)}${many}`, tooltip: 'Claude עובד. לחיצה פותחת את הצ\'אט.' };
      }
      if (convs.some((c) => c.unread) || (finishedAt && now - finishedAt < FINISHED_MS)) {
        return { state: 'finished', text: '$(check) Claude · הסתיים', tooltip: 'Claude סיים. לחיצה פותחת את הצ\'אט.' };
      }
      return { state: 'idle', text: '✻ Claude', tooltip: 'פתיחת Claude Code Local' };
    },
  };
}

module.exports = { createStatusTracker, clock, FINISHED_MS };
