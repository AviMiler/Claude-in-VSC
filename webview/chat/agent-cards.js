// Agent cards: one collapsible card per sub-agent call, placed right after its Agent tool row.
// The host sends the changed cards (`agentCards`); opened, a card lists the tools the sub-agent
// ran. Live only.
(function () {
  const { el } = CL;
  const STATE = {
    running: { icon: '◐', text: 'רץ' },
    done: { icon: '✓', text: 'הסתיים' },
    error: { icon: '✕', text: 'נכשל' },
    stopped: { icon: '■', text: 'נעצר' },
  };
  const TOOL_ICON = { running: '◐', ok: '✓', err: '✕' };
  const cards = new Map(); // tool_use id -> { node, open }

  function metaText(c) {
    const parts = [(STATE[c.state] || STATE.running).text];
    const uses = c.toolUses || c.tools.length;
    if (uses) parts.push(uses === 1 ? 'כלי אחד' : `${uses} כלים`);
    if (typeof c.durationMs === 'number') parts.push(`${(c.durationMs / 1000).toFixed(1)} שנ׳`);
    if (c.background) parts.push('ברקע');
    if (c.state === 'running' && c.lastTool) parts.push(`עכשיו: ${c.lastTool}`);
    return parts.join(' · ');
  }

  function toolList(c) {
    if (!c.tools.length) return el('div', { class: 'agent-empty', text: 'הסוכן עוד לא הפעיל כלים.' });
    return el('ul', { class: 'agent-tools' }, c.tools.map((t) => el('li', { class: `agent-tool ${t.state}` },
      el('span', { class: 'agent-tool-icon', text: TOOL_ICON[t.state] || '◐', 'aria-hidden': 'true' }),
      el('span', { class: 'agent-tool-name', text: CL.tools.displayName(t.name) }),
      el('span', { class: 'agent-tool-summary', dir: 'auto', text: CL.tools.summary(t.name, t.input).text }))));
  }

  function build(c, entry) {
    const state = STATE[c.state] || STATE.running;
    const title = [c.subagentType || 'סוכן משנה', c.description].filter(Boolean).join(' · ');
    const details = el('details', { class: `agent-card ${c.state}`, open: entry.open, ontoggle: (e) => { entry.open = e.currentTarget.open; } },
      el('summary', {},
        el('span', { class: 'agent-state', text: state.icon, 'aria-hidden': 'true' }),
        el('span', { class: 'agent-title', dir: 'auto', text: title }),
        el('span', { class: 'agent-meta', text: metaText(c) })),
      toolList(c),
      c.summary ? el('div', { class: 'agent-summary', dir: 'auto', text: c.summary }) : null);
    return details;
  }

  function render(list) {
    for (const c of Array.isArray(list) ? list : []) {
      const entry = cards.get(c.id) || { node: null, open: false };
      cards.set(c.id, entry);
      const node = build(c, entry);
      if (entry.node && entry.node.isConnected) entry.node.replaceWith(node);
      else {
        const row = CL.thread.toolNode(c.id);
        if (!row) continue; // the row arrives with the events; the next update attaches the card
        row.after(node);
      }
      entry.node = node;
    }
  }

  function reset() {
    cards.clear();
  }

  CL.agentCards = { render, reset };
})();
