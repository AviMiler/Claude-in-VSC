// Pure logic of the usage gauge and its card (PLAN.md section 9, "Usage gauge in the prompt line"):
// the fill level, and the per-category rows of the current session against the window.
// Loaded as a plain script in the webview (CL.usageLogic) and required by the node tests.
(function (root) {
  const WARN_PCT = 70;
  const DANGER_PCT = 85;

  // The CLI's category names (get_context_usage) -> key, Hebrew label, display order.
  const CATEGORIES = [
    { name: 'Messages', key: 'messages', label: 'הודעות' },
    { name: 'System prompt', key: 'system-prompt', label: 'הנחיית מערכת' },
    { name: 'System tools', key: 'system-tools', label: 'כלי מערכת' },
    { name: 'MCP tools', key: 'mcp-tools', label: 'כלי MCP' },
    { name: 'Custom agents', key: 'agents', label: 'סוכנים מותאמים' },
    { name: 'Skills', key: 'skills', label: 'מיומנויות (Skills)' },
    { name: 'Memory files', key: 'memory', label: 'קובצי זיכרון' },
  ];
  const BUFFER = 'Autocompact buffer';
  const FREE = 'Free space';
  const DEFERRED_LABELS = {
    'System tools': 'כלי מערכת שנטענים לפי הצורך',
    'MCP tools': 'כלי MCP שנטענים לפי הצורך',
  };
  const SOURCE_TEXT = {
    ollama: 'גודל החלון: לפי Ollama (המודל הטעון)',
    settings: 'גודל החלון: לפי ההגדרות (Ollama לא זמין)',
    cli: 'גודל החלון: לפי Claude Code',
  };

  const valid = (used, max) => Number.isFinite(used) && Number.isFinite(max) && max > 0 && used >= 0;

  // Whole percent of the window, 0..100.
  function percent(used, max) {
    return valid(used, max) ? Math.min(100, Math.round((used / max) * 100)) : 0;
  }

  // 'ok' | 'warn' (from 70%) | 'danger' (from 85%), the thresholds of the old context meter.
  function level(pct) {
    if (pct >= DANGER_PCT) return 'danger';
    if (pct >= WARN_PCT) return 'warn';
    return 'ok';
  }

  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

  // One decimal like the Claude app's panel; a non-zero sliver shows as "<0.1%".
  function fmtPct(tokens, max) {
    if (!(max > 0) || !(tokens > 0)) return '0%';
    const p = (tokens / max) * 100;
    return p < 0.1 ? '<0.1%' : `${Math.min(100, p).toFixed(1)}%`;
  }

  function labelOf(name) {
    const known = CATEGORIES.find((c) => c.name.toLowerCase() === String(name).toLowerCase());
    return known ? { key: known.key, label: known.label } : { key: 'other', label: String(name) };
  }

  // A usable category: a non-empty string name and a finite token count (never "null"/"undefined").
  const named = (c) => Boolean(c) && typeof c.name === 'string' && c.name.trim() !== '' && Number.isFinite(c.tokens);

  // Per-server MCP detail rows [{label, tokens}] from the host's mcpDetail; empty ones are skipped.
  function mcpRows(detail) {
    const out = [];
    for (const s of Array.isArray(detail) ? detail : []) {
      if (!s) continue;
      const label = `שרת MCP: ${typeof s.name === 'string' && s.name ? s.name : 'ללא שם'}`;
      if (Number.isFinite(s.tokens) && s.tokens > 0) out.push({ label, tokens: s.tokens });
      if (Number.isFinite(s.deferredTokens) && s.deferredTokens > 0) out.push({ label: `${label} (לפי הצורך)`, tokens: s.deferredTokens });
    }
    return out;
  }

  // msg: { used, max, categories: [{name, tokens, deferred}] }.
  // Returns { rows, deferred, used, max, pct, level }:
  //   rows: [{ key, label, tokens, pct }] in display order, used categories first, then the
  //   autocompact buffer and the free space, both recomputed against `max` (the CLI computed them
  //   against its own window, which may be larger);
  //   deferred: [{ label, tokens }] (not in the window, tokens only).
  // Without categories (an older CLI) one row "בשימוש" carries the whole used amount.
  function breakdown(msg) {
    const used = Number(msg && msg.used);
    const max = Number(msg && msg.max);
    if (!valid(used, max)) return null;
    const cats = Array.isArray(msg.categories) ? msg.categories : [];
    const rows = [];
    let buffer = 0;
    const deferred = [];
    for (const c of cats) {
      if (!named(c)) continue;
      if (c.deferred) {
        const base = String(c.name).replace(/\s*\(deferred\)$/i, '');
        deferred.push({ label: DEFERRED_LABELS[base] || `${labelOf(base).label} (לפי הצורך)`, tokens: c.tokens });
      } else if (c.name === BUFFER) {
        buffer = c.tokens;
      } else if (c.name !== FREE && c.tokens > 0) {
        rows.push({ ...labelOf(c.name), tokens: c.tokens });
      }
    }
    const order = (r) => {
      const i = CATEGORIES.findIndex((c) => c.key === r.key);
      return i < 0 ? CATEGORIES.length : i;
    };
    rows.sort((a, b) => order(a) - order(b));
    if (!rows.length && used > 0) rows.push({ key: 'messages', label: 'בשימוש', tokens: used });
    const room = Math.max(0, max - used);
    const buf = Math.min(Math.max(0, buffer), room);
    if (buf > 0) rows.push({ key: 'buffer', label: 'שמור לכיווץ אוטומטי', tokens: buf });
    rows.push({ key: 'free', label: 'מקום פנוי', tokens: room - buf });
    for (const r of rows) r.pct = fmtPct(r.tokens, max);
    const pct = percent(used, max);
    return { rows, deferred, mcp: mcpRows(msg.mcpDetail), used, max, pct, level: level(pct) };
  }

  // Bar segments: width in percent of the window for every row but the free space (the track).
  function segments(rows, max) {
    return (rows || []).filter((r) => r.key !== 'free' && r.tokens > 0)
      .map((r) => ({ key: r.key, width: Math.min(100, (r.tokens / max) * 100) }));
  }

  // The footer facts line, e.g. "קובצי זיכרון: 2 · שרתי MCP: 1"; '' when the CLI gave neither.
  function factsLine(memoryFiles, mcpServers) {
    const parts = [];
    if (Number.isInteger(memoryFiles)) parts.push(`קובצי זיכרון: ${memoryFiles}`);
    if (Number.isInteger(mcpServers)) parts.push(`שרתי MCP מחוברים: ${mcpServers}`);
    return parts.join(' · ');
  }

  const sourceText = (source) => SOURCE_TEXT[source] || SOURCE_TEXT.cli;

  // The gauge button's accessible name and tooltip.
  function gaugeLabel(used, max) {
    const pct = percent(used, max);
    return `הקשר בשימוש: ${pct}% (${fmt(used)} מתוך ${fmt(max)} אסימונים). לחיצה לפירוט`;
  }

  const api = { WARN_PCT, DANGER_PCT, percent, level, fmt, fmtPct, breakdown, segments, factsLine, sourceText, gaugeLabel };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CL = root.CL || {}).usageLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
