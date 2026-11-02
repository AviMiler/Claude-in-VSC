// Background tasks bar above the composer: one row per background task (Bash run_in_background,
// background sub-agent) with a small stop button while it runs. The host sends the whole list each time.
(function () {
  const { el, post } = CL;
  const TYPE_LABELS = { local_bash: 'פקודה', local_agent: 'סוכן' };
  const STATUS_LABELS = { completed: 'הסתיים', stopped: 'נעצר', killed: 'נעצר', failed: 'נכשל' };
  const bar = document.getElementById('bg-tasks');

  // Shared with the /loop bar (loop-bar.js): a square stop icon button, red on hover.
  function stopButton(title, onclick) {
    const b = el('button', { class: 'bg-task-stop', type: 'button', title, 'aria-label': title, onclick });
    b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="currentColor"/></svg>';
    return b;
  }

  function row(t) {
    const label = `${TYPE_LABELS[t.type] || 'משימה'}: ${t.description || t.id}`;
    const state = t.running
      ? stopButton('עצירת המשימה ברקע', (e) => { e.currentTarget.disabled = true; post({ type: 'stopTask', id: t.id }); })
      : el('span', { class: `bg-task-status s-${t.status || 'completed'}`, text: STATUS_LABELS[t.status] || t.status || 'הסתיים' });
    return el('li', { class: `bg-task${t.running ? ' running' : ''}`, title: t.summary || label },
      el('span', { class: 'bg-task-dot', 'aria-hidden': 'true' }),
      el('span', { class: 'bg-task-label', dir: 'auto', text: label }), state);
  }

  function render(tasks) {
    bar.replaceChildren();
    const list = Array.isArray(tasks) ? tasks : [];
    bar.hidden = list.length === 0;
    if (!list.length) return;
    const running = list.filter((t) => t.running).length;
    bar.append(el('div', { class: 'bg-tasks-title', text: running ? `משימות ברקע · ${running} פעילות` : 'משימות ברקע' }), el('ul', {}, list.map(row)));
  }

  CL.tasksBar = { render, stopButton };
})();
