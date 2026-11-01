// Context meter in the composer footer: "הקשר: 23,400 / 64,000". Clicking it sends /compact.
(function () {
  const spacer = document.querySelector('.composer-footer .spacer');
  const meter = CL.el('button', { class: 'chip context-meter', id: 'context-meter', type: 'button', title: 'לחצו לכיווץ ההקשר (/compact)' });
  meter.hidden = true;
  spacer.after(meter);

  let busy = false;
  const fmt = (n) => Number(n).toLocaleString('en-US');

  meter.addEventListener('click', () => {
    if (busy) return;
    CL.post({ type: 'send', text: '/compact', images: [] });
    CL.app.userSent('/compact');
  });

  CL.contextMeter = {
    // used/max null clears the meter (new conversation).
    set(used, max) {
      meter.hidden = !(Number.isFinite(used) && Number.isFinite(max) && max > 0);
      if (meter.hidden) return;
      const pct = Math.round((used / max) * 100);
      meter.textContent = `הקשר: ${fmt(used)} / ${fmt(max)}`;
      meter.setAttribute('aria-label', `הקשר בשימוש: ${pct} אחוז`);
      meter.classList.toggle('danger', pct >= 85);
    },
    setBusy(on) {
      busy = on;
      meter.disabled = on;
    },
  };
})();
