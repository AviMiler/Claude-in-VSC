// The /loop bar above the composer: each scheduled job with its schedule, the next run (computed
// here from the cron expression; the CLI reports none) and a stop button. Nothing is stored: the
// host sends the whole list (`loopJobs`) and it dies with the CLI process.
(function () {
  const { el, truncate } = CL;
  const REFRESH_MS = 30000;
  const box = document.getElementById('loop-jobs');
  let jobs = [];
  let timer = null;

  function timeText(d) {
    const sameDay = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return sameDay ? time : `${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} ${time}`;
  }

  // A one-shot job runs once at its first match after creation; afterwards it is gone.
  function nextRun(job) {
    if (!job.recurring) {
      const once = CL.cronNext.nextRun(job.cron, job.createdAt);
      return once && once.getTime() > Date.now() ? once : null;
    }
    return CL.cronNext.nextRun(job.cron, Date.now());
  }

  function row(job) {
    const next = nextRun(job);
    if (!job.recurring && !next) return null;
    const schedule = job.humanSchedule || job.cron;
    return el('li', { class: 'bg-task running' },
      el('span', { class: 'bg-task-label', dir: 'auto', title: job.prompt, text: `${job.recurring ? '🔁' : '⏰'} ${schedule} · ${truncate(job.prompt, 60)}` }),
      el('span', { class: 'bg-task-status', text: next ? `הבא: ${timeText(next)}` : `cron: ${job.cron}` }),
      el('button', { class: 'bg-task-stop', type: 'button', title: 'מבקש מ-Claude לבטל את המשימה (CronDelete)', text: 'עצירה', onclick: () => CL.post({ type: 'stopLoop', id: job.id }) }));
  }

  function draw() {
    const rows = jobs.map(row).filter(Boolean);
    box.replaceChildren();
    box.hidden = rows.length === 0;
    if (!rows.length) return;
    box.append(el('div', { class: 'bg-tasks-title', text: 'משימות מתוזמנות (/loop)' }), el('ul', {}, rows));
  }

  function render(list) {
    jobs = Array.isArray(list) ? list : [];
    clearInterval(timer);
    timer = jobs.length ? setInterval(draw, REFRESH_MS) : null;
    draw();
  }

  CL.loopBar = { render };
})();
