// Keyboard shortcut specs for the composer ("Ctrl+Enter", "Escape Escape"): parsing, matching, defaults.
// Loaded as a plain script in the webview (CL.keys) and required by the node tests.
(function (root) {
  const DEFAULTS = { send: 'Enter', newLine: 'Shift+Enter', rewind: 'Escape Escape' };
  const ALIASES = { esc: 'escape', return: 'enter', cmd: 'ctrl', control: 'ctrl', meta: 'ctrl', option: 'alt' };

  // "Ctrl+Shift+Enter" -> {ctrl, shift, alt, key}. Returns null for an unusable step.
  function parseStep(text) {
    const parts = String(text).split('+').map((p) => p.trim().toLowerCase()).filter(Boolean).map((p) => ALIASES[p] || p);
    if (!parts.length) return null;
    const key = parts.pop();
    if (['ctrl', 'shift', 'alt'].includes(key) && !parts.length) return null;
    return { ctrl: parts.includes('ctrl'), shift: parts.includes('shift'), alt: parts.includes('alt'), key };
  }

  // A spec is one or more steps separated by spaces; each step must be pressed in turn.
  function parseSpec(spec) {
    const steps = String(spec || '').trim().split(/\s+/).filter(Boolean).map(parseStep);
    return steps.length && steps.every(Boolean) ? steps : null;
  }

  // Ctrl and Cmd count as the same modifier, as before this setting existed.
  function matchesStep(e, step) {
    return (e.key || '').toLowerCase() === step.key
      && !!(e.ctrlKey || e.metaKey) === step.ctrl
      && !!e.shiftKey === step.shift
      && !!e.altKey === step.alt;
  }

  // The effective specs: invalid or empty values fall back to the defaults; useCtrlEnterToSend swaps
  // send/newLine only while both still have their default values.
  function resolve({ keybindings = {}, useCtrlEnterToSend = false } = {}) {
    const out = {};
    for (const name of Object.keys(DEFAULTS)) {
      out[name] = parseSpec(keybindings[name]) ? String(keybindings[name]).trim() : DEFAULTS[name];
    }
    if (useCtrlEnterToSend && out.send === DEFAULTS.send && out.newLine === DEFAULTS.newLine) {
      out.send = 'Ctrl+Enter';
      out.newLine = 'Enter';
    }
    return out;
  }

  // feed(event) is true when the last step of the spec has just been completed within windowMs.
  function createSequence(spec, windowMs = 600) {
    const steps = parseSpec(spec) || [];
    let index = 0;
    let last = 0;
    return {
      feed(e, now = Date.now()) {
        if (!steps.length) return false;
        if (index > 0 && now - last > windowMs) index = 0;
        if (matchesStep(e, steps[index])) {
          index += 1;
          last = now;
          if (index === steps.length) {
            index = 0;
            return true;
          }
          return false;
        }
        index = matchesStep(e, steps[0]) ? 1 : 0;
        last = now;
        return false;
      },
    };
  }

  function matches(e, spec) {
    const steps = parseSpec(spec);
    return !!steps && steps.length === 1 && matchesStep(e, steps[0]);
  }

  const api = { DEFAULTS, parseSpec, matches, resolve, createSequence };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CL = root.CL || {}).keys = api;
})(typeof window !== 'undefined' ? window : globalThis);
