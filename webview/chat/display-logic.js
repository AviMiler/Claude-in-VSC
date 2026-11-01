// Pure logic of the display settings: waiting words, message time stamps and speaker labels.
// Loaded as a plain script in the webview (CL.displayLogic) and required by the node tests.
(function (root) {
  const SPEAKERS = { user: 'אתה', assistant: 'Claude' };

  // A custom, non-empty list replaces the extension's words; `rand` is injectable for tests.
  function pickVerb(defaults, custom, rand = Math.random) {
    const list = Array.isArray(custom) && custom.length ? custom : defaults;
    return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  }

  function formatTime(ms) {
    const d = new Date(ms);
    const two = (n) => String(n).padStart(2, '0');
    return `${two(d.getHours())}:${two(d.getMinutes())}`;
  }

  function speakerLabel(kind) {
    return SPEAKERS[kind] || '';
  }

  // The text of a message heading: the speaker, plus the time when known.
  function headingText(kind, ms) {
    const label = speakerLabel(kind);
    return typeof ms === 'number' ? `${label} · ${formatTime(ms)}` : label;
  }

  const api = { SPEAKERS, pickVerb, formatTime, speakerLabel, headingText };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CL = root.CL || {}).displayLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
