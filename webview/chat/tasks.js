// Claude's pinned task list (its TaskCreate / TaskUpdate tool calls), above the composer.
// Collapsible; the host sends the whole list each time.
(function () {
  const { el } = CL;
  const ICONS = { pending: '○', in_progress: '◐', completed: '✓' };
  const box = document.getElementById('claude-tasks');
  let open = true;

  function render(tasks) {
    box.replaceChildren();
    const list = Array.isArray(tasks) ? tasks : [];
    box.hidden = list.length === 0;
    if (!list.length) return;
    const done = list.filter((t) => t.status === 'completed').length;
    const details = el('details', { open, ontoggle: (e) => { open = e.currentTarget.open; } },
      el('summary', { text: `המשימות של Claude (${done}/${list.length})` }),
      el('ul', {}, list.map((t) => el('li', { class: `claude-task ${t.status}` },
        el('span', { class: 'claude-task-icon', text: ICONS[t.status] || '○', 'aria-hidden': 'true' }),
        el('span', { text: t.subject || `#${t.id}` })))));
    box.append(details);
  }

  CL.claudeTasks = { render };
})();
