// "Stop and switch": during a turn the model picker is disabled (composer.js) and this button
// offers the switch instead; the host asks for confirmation and explains what is lost.
(function () {
  const { post } = CL;
  const modelBtn = document.getElementById('model-btn');
  const btn = CL.el('button', { class: 'chip', id: 'stop-switch-btn', type: 'button', title: 'עצירת התור והחלפת מודל', text: '⏹ עצירה והחלפת מודל' });
  btn.hidden = true;
  modelBtn.after(btn);

  let models = [];
  let current = 'default';
  let busy = false;

  function refresh() {
    btn.hidden = !busy || models.length < 2;
  }

  btn.addEventListener('click', () => {
    const items = models
      .filter((m) => m.value !== current)
      .map((m) => ({ value: m.value, label: m.displayName || m.value, desc: m.description }));
    CL.menu.open(btn, items, (value) => post({ type: 'stopAndSwitchModel', value }));
  });

  CL.modelPicker = {
    setModels(list, cur) {
      models = list || [];
      if (cur) current = cur;
      refresh();
    },
    setModel(value) {
      current = value;
    },
    setBusy(on) {
      busy = on;
      refresh();
    },
  };
})();
