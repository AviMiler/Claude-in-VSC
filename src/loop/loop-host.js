// Host side of the /loop indicator: tracks the cron jobs (loop-jobs.js), marks turns the CLI starts
// by itself (self-turn.js) and sends the stop request. Logs under [loop]: counts, job ids and cron
// expressions only, never the job's prompt.
const { TAGS } = require('../util/log-tags');
const loopJobs = require('./loop-jobs');
const { startsSelfTurn } = require('./self-turn');

// After a stopped turn is closed locally (no `result` came), its late lines are not a new turn.
const LATE_LINES_MS = 10000;

// conv: the Conversation (busy, proc, post, send, services.logger, loop, forcedEndAt).
function trackLoop(conv, msg, now = Date.now()) {
  const late = conv.forcedEndAt && now - conv.forcedEndAt < LATE_LINES_MS;
  if (!late && startsSelfTurn(msg, conv.busy)) {
    // Unverified sequence (DEPENDENCIES.md row 38): the turn stays open until its `result`.
    conv.busy = true;
    conv.services.logger.info(TAGS.LOOP, 'self-started turn (no user message)');
    conv.post({ type: 'selfTurn' });
  }
  if (!loopJobs.applyMessage(conv.loop, msg)) return;
  const jobs = loopJobs.listJobs(conv.loop);
  conv.services.logger.info(TAGS.LOOP, `jobs now ${jobs.length}${jobs.length ? ` (${jobs.map((j) => `${j.id} "${j.cron}"`).join(', ')})` : ''}`);
  conv.post({ type: 'loopJobs', jobs });
}

// A new CLI process has no jobs (they are session-only).
function resetLoop(conv) {
  const had = conv.loop && conv.loop.jobs.size > 0;
  conv.loop = loopJobs.createLoopJobs();
  if (had) {
    conv.services.logger.info(TAGS.LOOP, 'jobs cleared (new CLI process)');
    conv.post({ type: 'loopJobs', jobs: [] });
  }
}

function stopLoop(conv, id) {
  const text = loopJobs.stopPrompt(id);
  if (!text || !conv.loop || !conv.loop.jobs.has(id)) return;
  if (conv.busy) return conv.post({ type: 'notice', text: 'אפשר לעצור את המשימה המתוזמנת כש-Claude לא עובד. נסו שוב בסיום התור.' });
  conv.services.logger.info(TAGS.LOOP, `stop requested for job ${id} (asks Claude to run CronDelete)`);
  conv.send(text, []);
  conv.post({ type: 'busy', value: true });
  return conv.post({ type: 'notice', text: 'ביקשתי מ-Claude לבטל את המשימה המתוזמנת.' });
}

module.exports = { trackLoop, resetLoop, stopLoop };
