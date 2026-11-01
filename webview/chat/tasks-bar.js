// Background tasks bar above the composer: one row per background task (Bash run_in_background,
// background sub-agent) with a stop button while it runs. The host sends the whole list each time.
(function () {
  const { el, post } = CL;
  const TYPE_LABELS = { local_bash: 'פקודה', local_agent: 'סוכן' };
  const STATUS_LABELS = { completed: 'הסתיים', stopped: 'נעצר', killed: 'נעצר', failed: 'נכשל' };
  const bar = document.getElementById('bg-tasks');

  function row(t) {
    const label = `${TYPE_LABELS[t.type] || 'משימה'}: ${t.description || t.id}`;
    const state = t.running
      ? el('button', { class: 'bg-task-stop', type: 'button', text: 'עצירה', title: 'עצירת המשימה ברקע', onclick: (e) => { e.currentTarget.disabled = true; post({ type: 'stopTask', id: t.id }); } })
      : el('span', { class: 'bg-task-status', text: STATUS_LABELS[t.status] || t.status || 'הסתיים' });
    return el('li', { class: `bg-task${t.running ? ' running' : ''}`, title: t.summary || label },
      el('span', { class: 'bg-task-label', text: label }), state);
  }

  function render(tasks) {
    bar.replaceChildren();
    const list = Array.isArray(tasks) ? tasks : [];
    bar.hidden = list.length === 0;
    if (!list.length) return;
    const running = list.filter((t) => t.running).length;
    bar.append(el('div', { class: 'bg-tasks-title', text: `משימות ברקע (${running} פעילות)` }), el('ul', {}, list.map(row)));
  }

  CL.tasksBar = { render };
})();
