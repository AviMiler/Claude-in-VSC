// Pure logic of the conversations drawer: filter, search, day groups and short times.
// Loaded as a plain script in the webview (CL.drawerLogic) and required by the node tests.
(function (root) {
  const FILTERS = [
    { id: 'all', label: 'הכול' },
    { id: 'running', label: 'פעילות' },
    { id: 'waiting', label: 'ממתינות' },
    { id: 'finished', label: 'הסתיימו' },
  ];
  const STATUS_TEXT = { running: 'עובדת', waiting: 'ממתינה לאישור', unread: 'הסתיימה', idle: '' };
  const DAY = 24 * 60 * 60 * 1000;

  // An open row's status against a filter; past conversations count as finished.
  function matches(status, filter) {
    if (!filter || filter === 'all') return true;
    if (filter === 'finished') return status === 'unread' || status === 'idle' || status === 'past';
    return status === filter;
  }

  // open: [{id, title, status, current}], past: [{id, title, mtime}].
  function filterRows(open, past, filter, query) {
    const q = String(query || '').trim().toLowerCase();
    const hit = (title) => !q || String(title || '').toLowerCase().includes(q);
    return {
      open: (open || []).filter((r) => matches(r.status, filter) && hit(r.title)),
      past: (past || []).filter((r) => matches('past', filter) && hit(r.title)),
    };
  }

  function groupOf(mtime, now) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const today = start.getTime();
    if (mtime >= today) return 'היום';
    if (mtime >= today - DAY) return 'אתמול';
    if (mtime >= today - 7 * DAY) return 'השבוע';
    return 'קודם';
  }

  // [{label, items}] in the order of the (newest first) list.
  function groupPast(past, now) {
    const groups = [];
    for (const item of past) {
      const label = groupOf(item.mtime, now);
      if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
      groups[groups.length - 1].items.push(item);
    }
    return groups;
  }

  // Like the official list's "4h": short, at the end of the row.
  function shortTime(mtime, now) {
    const mins = Math.max(0, Math.round((now - mtime) / 60000));
    if (mins < 1) return 'עכשיו';
    if (mins < 60) return `${mins} דק׳`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} שע׳`;
    const days = Math.round(hours / 24);
    if (days < 30) return days === 1 ? 'יום' : `${days} ימים`;
    return new Date(mtime).toLocaleDateString('he-IL');
  }

  // The dot on the drawer button: blue when a hidden conversation waits, orange when one finished unread.
  function attentionDot(attention) {
    if (attention && attention.waiting) return 'waiting';
    if (attention && attention.unread) return 'unread';
    return null;
  }

  const api = { FILTERS, STATUS_TEXT, matches, filterRows, groupOf, groupPast, shortTime, attentionDot };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CL = root.CL || {}).drawerLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
