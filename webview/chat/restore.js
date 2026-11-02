// Redraws a conversation the user switched to (host message `restore`, built by
// src/panels/replay-log.js): one reset, then the recorded thread in batches, the bars, the pending
// permission cards and the composer state. Painted once, in one task: no per-token work.
(function () {
  // Runs of events go to the thread in one call; other recorded messages go through `dispatch`.
  function paintItems(items, dispatch) {
    let run = [];
    const flush = () => {
      if (!run.length) return;
      for (const ev of run) {
        if (ev.kind === 'session' && (ev.skills || ev.terminalOnly)) CL.slashMenu.setMeta({ skills: ev.skills, terminalOnly: ev.terminalOnly });
      }
      CL.thread.apply(run);
      run = [];
    };
    for (const item of items) {
      if (item.ev) run.push(item.ev);
      else {
        flush();
        dispatch(item.msg);
      }
    }
    flush();
  }

  // reset(): clears the view; dispatch(msg): the app's handler table; setTitle/setBusy from app.js.
  function restore(m, { reset, dispatch, setTitle, setBusy }) {
    reset();
    dispatch(m.init);
    if (m.base) {
      CL.thread.apply(m.base.events || []);
      CL.thread.endTurn();
    }
    setTitle(m.title || (m.base && m.base.title) || '');
    paintItems(m.items || [], dispatch);
    for (const s of m.snapshots || []) dispatch(s);
    for (const p of m.permissions || []) CL.cards.show(p);
    CL.composer.restore({ sent: m.sent, ui: m.ui });
    setBusy(Boolean(m.busy));
    CL.thread.scrollToBottom();
    CL.composer.focus();
  }

  CL.restore = { restore };
})();
