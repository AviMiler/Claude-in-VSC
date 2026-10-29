// Cards for the CLI's can_use_tool requests: a permission card, the plan card (ExitPlanMode)
// and a question card (AskUserQuestion). The CLI decides; a card only relays the answer.
(function () {
  const { el, post } = CL;

  const open = new Map(); // requestId -> {node, finish(text, ok)}

  const TITLES = {
    Bash: 'Claude רוצה להריץ פקודה',
    PowerShell: 'Claude רוצה להריץ פקודה',
    Write: 'Claude רוצה לכתוב קובץ',
    Edit: 'Claude רוצה לערוך קובץ',
    MultiEdit: 'Claude רוצה לערוך קובץ',
    NotebookEdit: 'Claude רוצה לערוך מחברת',
    Read: 'Claude רוצה לקרוא קובץ',
    WebFetch: 'Claude רוצה לגשת לכתובת אינטרנט',
    WebSearch: 'Claude רוצה לחפש באינטרנט',
  };

  function answer(requestId, payload) {
    post({ type: 'permissionAnswer', requestId, ...payload });
  }

  function shell(requestId, title, contentNodes) {
    const actions = el('div', { class: 'card-actions' });
    const node = el('div', { class: 'tl tl-card' },
      el('div', { class: 'card' }, el('div', { class: 'card-title', dir: 'auto', text: title }), contentNodes, actions));
    const finish = (text, ok) => {
      actions.replaceChildren(el('span', { class: `card-done ${ok ? 'ok' : 'no'}`, text }));
      open.delete(requestId);
    };
    open.set(requestId, { node, finish });
    return { node, actions, finish };
  }

  function denyControls(requestId, actions, finish, { denyLabel, placeholder }) {
    const reason = el('input', { class: 'card-input', type: 'text', dir: 'auto', placeholder });
    const deny = () => {
      answer(requestId, { behavior: 'deny', message: reason.value.trim() || undefined });
      finish(reason.value.trim() ? `✕ נדחה: ${reason.value.trim()}` : '✕ נדחה', false);
    };
    reason.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) deny();
    });
    actions.append(reason, el('button', { class: 'btn btn-ghost', text: denyLabel, onclick: deny }));
    return reason;
  }

  function permissionCard(req) {
    const s = CL.tools.summary(req.tool, req.input);
    const title = TITLES[req.tool] || `Claude רוצה להשתמש ב-${CL.tools.displayName(req.tool)}`;
    const content = [];
    if (req.reason) content.push(el('div', { class: 'card-reason', dir: 'auto', text: req.reason }));
    if (s.path) content.push(el('pre', { class: 'card-pre', text: s.text }));
    const view = CL.tools.inputView(req.tool, req.input);
    view.classList.add('card-pre');
    content.push(view);
    const { node, actions, finish } = shell(req.requestId, title, content);
    const allow = (always) => {
      answer(req.requestId, { behavior: 'allow', always });
      finish(always ? '✓ אושר תמיד בפרויקט הזה' : '✓ אושר', true);
    };
    actions.append(el('button', { class: 'btn btn-primary', text: 'אישור', onclick: () => allow(false) }));
    if (req.suggestions) actions.append(el('button', { class: 'btn btn-secondary', text: 'אישור תמיד', onclick: () => allow(true) }));
    denyControls(req.requestId, actions, finish, { denyLabel: 'דחייה', placeholder: 'מה לעשות במקום? (לא חובה)' });
    return node;
  }

  function planCard(req) {
    const plan = el('div', { class: 'card-plan md', dir: 'auto' });
    CL.markdown.render(plan, req.input.plan || '');
    const { node, actions, finish } = shell(req.requestId, 'התוכנית של Claude', [plan]);
    actions.append(el('button', {
      class: 'btn btn-primary',
      text: 'אישור התוכנית',
      onclick: () => {
        answer(req.requestId, { behavior: 'allow' });
        finish('✓ התוכנית אושרה', true);
      },
    }));
    denyControls(req.requestId, actions, finish, { denyLabel: 'המשך תכנון', placeholder: 'מה לשנות בתוכנית?' });
    return node;
  }

  function questionCard(req) {
    const questions = req.input.questions || [];
    const chosen = questions.map(() => new Set());
    const others = [];
    const blocksEls = questions.map((q, qi) => {
      const optionEls = (q.options || []).map((o) => {
        const btn = el('button', { class: 'q-option', type: 'button' },
          el('span', { dir: 'auto' }, o.label, o.description ? el('span', { class: 'q-option-desc', text: o.description }) : null));
        btn.addEventListener('click', () => {
          if (!q.multiSelect) {
            chosen[qi].clear();
            for (const b of optionEls) b.classList.remove('sel');
          }
          if (chosen[qi].has(o.label)) chosen[qi].delete(o.label);
          else chosen[qi].add(o.label);
          btn.classList.toggle('sel', chosen[qi].has(o.label));
        });
        return btn;
      });
      const other = el('input', { class: 'card-input', type: 'text', dir: 'auto', placeholder: 'אחר…' });
      others[qi] = other;
      return el('div', { class: 'q-block' },
        q.header ? el('span', { class: 'q-header', text: q.header }) : null,
        el('div', { class: 'q-text', dir: 'auto', text: q.question }),
        optionEls, other);
    });
    const { node, actions, finish } = shell(req.requestId, 'ל-Claude יש שאלה', blocksEls);
    actions.append(el('button', {
      class: 'btn btn-primary',
      text: 'שליחת תשובות',
      onclick: () => {
        const answers = {};
        questions.forEach((q, qi) => {
          const picked = [...chosen[qi]];
          if (others[qi].value.trim()) picked.push(others[qi].value.trim());
          if (picked.length) answers[q.question] = picked.join(', ');
        });
        answer(req.requestId, { behavior: 'allow', updatedInput: { ...req.input, answers } });
        finish('✓ התשובות נשלחו', true);
      },
    }));
    denyControls(req.requestId, actions, finish, { denyLabel: 'דילוג', placeholder: 'הערה (לא חובה)' });
    return node;
  }

  function show(req) {
    let node;
    if (req.tool === 'ExitPlanMode') node = planCard(req);
    else if (req.tool === 'AskUserQuestion') node = questionCard(req);
    else node = permissionCard(req);
    CL.thread.addNode(node);
    CL.thread.scrollToBottom();
    const first = node.querySelector('.btn-primary');
    if (first) first.focus({ preventScroll: true });
  }

  function cancel(requestId) {
    const card = open.get(requestId);
    if (card) card.finish('הבקשה בוטלה', false);
  }

  CL.cards = { show, cancel };
})();
