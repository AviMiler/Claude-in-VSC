// Context meter in the composer footer: how full the model's window is. Display only (F-10: a click
// used to send /compact; compacting stays the user's own `/compact`).
(function () {
  const modeBtn = document.getElementById('mode-btn');
  const meter = CL.el('span', { class: 'context-meter', id: 'context-meter', role: 'status' });
  meter.hidden = true;
  modeBtn.before(meter);

  const fmt = (n) => Number(n).toLocaleString('en-US');
  const short = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

  CL.contextMeter = {
    // used/max null clears the meter (new conversation).
    set(used, max) {
      meter.hidden = !(Number.isFinite(used) && Number.isFinite(max) && max > 0);
      if (meter.hidden) return;
      const pct = Math.min(100, Math.round((used / max) * 100));
      meter.textContent = `${pct}%`;
      meter.title = `הקשר בשימוש: ${fmt(used)} מתוך ${fmt(max)} (${short(used)}/${short(max)}). לכיווץ: /compact`;
      meter.setAttribute('aria-label', `הקשר בשימוש: ${pct} אחוז`);
      meter.classList.toggle('warn', pct >= 70 && pct < 85);
      meter.classList.toggle('danger', pct >= 85);
    },
  };
})();
