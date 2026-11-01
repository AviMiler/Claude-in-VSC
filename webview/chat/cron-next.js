// Pure: the next run time of a 5-field cron expression ("min hour day-of-month month
// day-of-week"), for the /loop bar; the CLI reports none (DEPENDENCIES.md row 38). Local time is
// assumed (unverified). Supports *, numbers, a-b, lists, /step and 3-letter month/day names.
// Loaded as a webview script (CL.cronNext) and required by the unit tests.
(function () {
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const FIELDS = [
    { min: 0, max: 59 },
    { min: 0, max: 23 },
    { min: 1, max: 31 },
    { min: 1, max: 12, names: MONTHS, base: 1 },
    { min: 0, max: 7, names: DAYS, base: 0 },
  ];
  const MAX_STEPS = 100000;

  function value(text, f) {
    const name = f.names ? f.names.indexOf(text.toLowerCase()) : -1;
    if (name >= 0) return name + f.base;
    return /^\d+$/.test(text) ? Number(text) : NaN;
  }

  // -> Set of allowed values, or null when the field is invalid.
  function parseField(text, f) {
    const set = new Set();
    for (const part of text.split(',')) {
      const m = /^(\*|[a-z0-9]+(?:-[a-z0-9]+)?)(?:\/(\d+))?$/i.exec(part);
      if (!m) return null;
      const step = m[2] ? Number(m[2]) : 1;
      let lo = f.min;
      let hi = f.max;
      if (m[1] !== '*') {
        const [a, b] = m[1].split('-');
        lo = value(a, f);
        hi = b === undefined ? (m[2] ? f.max : lo) : value(b, f);
      }
      if (!(step >= 1) || Number.isNaN(lo) || Number.isNaN(hi) || lo < f.min || hi > f.max || lo > hi) return null;
      for (let v = lo; v <= hi; v += step) set.add(v);
    }
    return set;
  }

  // -> {minute, hour, dom, month, dow, domAny, dowAny} or null.
  function parseCron(expr) {
    const parts = String(expr || '').trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const sets = parts.map((p, i) => parseField(p, FIELDS[i]));
    if (sets.some((s) => !s)) return null;
    if (sets[4].has(7)) sets[4].add(0);
    return { minute: sets[0], hour: sets[1], dom: sets[2], month: sets[3], dow: sets[4], domAny: parts[2] === '*', dowAny: parts[4] === '*' };
  }

  // Classic cron: when both day fields are restricted, either one matching is enough.
  function dayMatches(c, d) {
    const dom = c.dom.has(d.getDate());
    const dow = c.dow.has(d.getDay());
    if (c.domAny && c.dowAny) return true;
    if (c.domAny) return dow;
    if (c.dowAny) return dom;
    return dom || dow;
  }

  // The first matching minute strictly after `from` (a Date or ms), or null.
  function nextRun(expr, from) {
    const c = parseCron(expr);
    if (!c) return null;
    const d = new Date(typeof from === 'number' ? from : (from || new Date()).getTime());
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);
    for (let i = 0; i < MAX_STEPS; i++) {
      if (!c.month.has(d.getMonth() + 1)) {
        d.setMonth(d.getMonth() + 1, 1);
        d.setHours(0, 0, 0, 0);
      } else if (!dayMatches(c, d)) {
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
      } else if (!c.hour.has(d.getHours())) {
        d.setHours(d.getHours() + 1, 0, 0, 0);
      } else if (!c.minute.has(d.getMinutes())) {
        d.setMinutes(d.getMinutes() + 1, 0, 0);
      } else return d;
    }
    return null;
  }

  const api = { parseCron, nextRun };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else CL.cronNext = api;
})();
