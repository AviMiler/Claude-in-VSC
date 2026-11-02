// Dev only: stands in for the extension host in dev/preview-server.js. It answers the webview's
// messages with canned UI events so every part of the design can be looked at in a browser.
(function () {
  const toWebview = (data) => window.dispatchEvent(new MessageEvent('message', { data }));
  const later = (ms, fn) => setTimeout(fn, ms);
  let n = 0;

  const MD = [
    '## סיכום השינויים',
    '',
    'עברתי על `src/cli/process.js` ומצאתי **שתי בעיות**. הנה מה שכדאי לעשות:',
    '',
    '1. לסגור את ה-stdin כשהתהליך מסתיים.',
    '2. לטפל ב-`error` של spawn, because otherwise the extension host crashes.',
    '',
    '> הערה: ה-CLI הוא מקור האמת, ולכן התוסף לא שומר כלום.',
    '',
    '| קובץ | שינוי | שורות |',
    '|---|---|---|',
    '| `process.js` | תיקון סגירה | 12 |',
    '| `spawn.js` | ללא | 0 |',
    '',
    '```js',
    "const { spawn } = require('child_process');",
    '',
    'function start(cmd, args) {',
    "  const child = spawn(cmd, args, { stdio: 'pipe' });",
    "  child.on('error', (err) => console.error(err)); // never crash",
    '  return child;',
    '}',
    '```',
    '',
    'רוצה שאמשיך? ראו גם [התיעוד](https://code.claude.com/docs).',
  ].join('\n');

  function stream(key, text, done) {
    const pieces = text.match(/[\s\S]{1,14}/g);
    let i = 0;
    const tick = () => {
      if (i < pieces.length) {
        toWebview({ type: 'events', events: [{ kind: 'delta', key, blockType: 'text', text: pieces[i++] }] });
        later(18, tick);
      } else {
        toWebview({ type: 'events', events: [{ kind: 'block', key, blockType: 'text', text }] });
        done();
      }
    };
    tick();
  }

  function result() {
    toWebview({ type: 'events', events: [{ kind: 'result', isError: false, durationMs: 8421, inputTokens: 18400, outputTokens: 912 }] });
  }

  function turn(text) {
    const m = `m${++n}`;
    toWebview({ type: 'events', events: [{ kind: 'block', key: `${m}:t`, blockType: 'thinking', text: 'צריך לקרוא קודם את הקובץ ואז להציע שינוי.' }] });
    later(300, () => {
      toWebview({ type: 'events', events: [
        { kind: 'tool', key: `${m}:1`, id: `${m}-read`, name: 'Read', input: { file_path: 'C:\\proj\\src\\cli\\process.js' }, final: true },
      ] });
      later(400, () => {
        toWebview({ type: 'events', events: [{ kind: 'toolResult', toolUseId: `${m}-read`, text: "1\tconst { spawn } = require('child_process');\n2\t// ...", isError: false }] });
        toWebview({ type: 'events', events: [
          { kind: 'tool', key: `${m}:2`, id: `${m}-bash`, name: 'Bash', input: { command: 'npm test -- --grep process', description: 'Run tests' }, final: true },
          { kind: 'tool', key: `${m}:3`, id: `${m}-edit`, name: 'Edit', input: { file_path: 'C:\\proj\\src\\cli\\process.js', old_string: "child.stdin.write(line);", new_string: "if (!this.exited) child.stdin.write(line);" }, final: true },
        ] });
        if (/tool|כלי/.test(text)) {
          toWebview({ type: 'permission', requestId: `${m}-perm`, tool: 'Bash', input: { command: 'npm test -- --grep process' }, suggestions: true });
          return;
        }
        toWebview({ type: 'events', events: [
          { kind: 'toolResult', toolUseId: `${m}-bash`, text: 'Error: 1 test failed', isError: true },
          { kind: 'toolResult', toolUseId: `${m}-edit`, text: 'The file was updated.', isError: false },
          { kind: 'tool', key: `${m}:4`, id: `${m}-todo`, name: 'TodoWrite', input: { todos: [
            { content: 'לקרוא את process.js', status: 'completed' },
            { content: 'לתקן את סגירת ה-stdin', activeForm: 'מתקן את סגירת ה-stdin', status: 'in_progress' },
            { content: 'להריץ בדיקות', status: 'pending' },
          ] }, final: true },
        ] });
        stream(`${m}:5`, MD, result);
      });
    });
  }

  // Several conversations in one view, like src/panels/conversation-host.js.
  const convs = [
    { id: 'c1', sessionId: 's1', title: 'שיחה חדשה', status: 'idle' },
    { id: 'c2', sessionId: 's2', title: 'Refactor the auth middleware', status: 'running' },
    { id: 'c3', sessionId: 's3', title: 'תיקון באג בתהליך ה-CLI', status: 'waiting' },
    { id: 'c4', sessionId: 's4', title: 'הוספת היסטוריית שיחות', status: 'unread' },
  ];
  let current = 'c1';
  const rows = () => convs.map((c) => ({ ...c, current: c.id === current }));
  function states() {
    const hidden = convs.filter((c) => c.id !== current);
    toWebview({ type: 'conversationStates', open: rows(), attention: { waiting: hidden.filter((c) => c.status === 'waiting').length, unread: hidden.filter((c) => c.status === 'unread').length } });
  }
  const INIT = { type: 'init', settings: { useCtrlEnterToSend: false, allowBypass: true }, cwd: 'C:\\proj', noFolder: false, permissionMode: 'default' };
  function restoreOf(c) {
    const items = c.id === 'c1' ? [] : [
      { ev: { kind: 'user', text: c.title } },
      { ev: { kind: 'block', key: `${c.id}:t`, blockType: 'text', text: 'בודק את הקוד. **רגע אחד.**' } },
      { ev: { kind: 'tool', key: `${c.id}:1`, id: `${c.id}-bash`, name: 'Bash', input: { command: 'npm test', description: 'Run tests' }, final: true } },
    ];
    if (c.status === 'unread') items.push({ ev: { kind: 'toolResult', toolUseId: `${c.id}-bash`, text: '12 passing', isError: false } }, { ev: { kind: 'result', isError: false, durationMs: 5200, inputTokens: 9100, outputTokens: 400 } });
    const snapshots = [{ type: 'mode', value: c.id === 'c2' ? 'acceptEdits' : 'default' }, { type: 'context', used: c.id === 'c1' ? 0 : 23400, max: 64000 }];
    if (c.id === 'c2') snapshots.push({ type: 'backgroundTasks', tasks: [
      { id: 'b1', type: 'local_bash', description: 'npm run watch', running: true },
      { id: 'b2', type: 'local_agent', description: 'סריקת קבצי הבדיקה', running: false, status: 'completed' },
    ] }, { type: 'loopJobs', jobs: [{ id: 'j1', cron: '*/5 * * * *', humanSchedule: 'כל 5 דקות', prompt: 'בדוק את מצב הבנייה', recurring: true, createdAt: Date.now() }] });
    const permissions = c.status === 'waiting' ? [{ type: 'permission', requestId: `${c.id}-perm`, tool: 'Bash', input: { command: 'npm test -- --grep process' }, suggestions: true }] : [];
    return { type: 'restore', id: c.id, title: c.id === 'c1' ? '' : c.title, init: INIT, base: null, items, snapshots, sent: items.filter((i) => i.ev.kind === 'user').map((i) => i.ev.text), permissions, busy: c.status === 'running' || c.status === 'waiting', ui: null };
  }
  function switchTo(id) {
    current = id;
    const c = convs.find((x) => x.id === id);
    if (c.status === 'unread') c.status = 'idle';
    toWebview(restoreOf(c));
    states();
  }

  function handle(msg) {
    switch (msg.type) {
      case 'newConversation': {
        const id = `c${convs.length + 1}`;
        convs.push({ id, sessionId: null, title: 'שיחה חדשה', status: 'idle' });
        switchTo(id);
        break;
      }
      case 'switchConversation':
        switchTo(msg.id);
        break;
      case 'closeConversation': {
        const i = convs.findIndex((c) => c.id === msg.id);
        if (i >= 0) convs.splice(i, 1);
        if (msg.id === current) switchTo(convs[convs.length - 1].id);
        else states();
        break;
      }
      case 'renameConversation': {
        const c = convs.find((x) => x.id === msg.id);
        if (c) c.title = msg.title;
        states();
        break;
      }
      case 'listConversations': {
        const now = Date.now();
        later(120, () => toWebview({ type: 'conversations', open: rows(), past: [
          { id: 'a', title: 'Git fetch', mtime: now - 4 * 3600e3 },
          { id: 'b', title: 'בדיקת תוכניות פיתוח', mtime: now - 5 * 3600e3 },
          { id: 'c', title: 'Angular טבלה חיצונית מחיקה בטוחה', mtime: now - 26 * 3600e3 },
          { id: 'd', title: 'סנכרון עם GitHub', mtime: now - 4 * 86400e3 },
          { id: 'e', title: 'Explain the webview CSP', mtime: now - 20 * 86400e3 },
        ] }));
        break;
      }
      case 'viewFocus':
        break;
      case 'mcp':
        if (msg.action === 'status') later(100, () => toWebview({ type: 'mcpState', servers: [
          { name: 'github', status: 'connected', statusText: 'מחובר', enabled: true, toolCount: 26, scope: 'user' },
          { name: 'filesystem', status: 'failed', statusText: 'נכשל', enabled: true, error: 'spawn npx ENOENT', scope: 'local' },
          { name: 'playwright', status: 'disabled', statusText: 'מושבת', enabled: false, scope: 'project' },
        ] }));
        break;
      case 'ready':
        toWebview({ type: 'init', settings: { useCtrlEnterToSend: false, allowBypass: true }, cwd: 'C:\\proj', noFolder: false, permissionMode: 'default' });
        toWebview({ type: 'commands', commands: [
          { name: 'compact', description: 'Clear conversation history but keep a summary in context', argumentHint: '<instructions>' },
          { name: 'code-review', description: 'Review the current diff for correctness bugs', argumentHint: '[low|high]' },
          { name: 'enforcing-coding-workflow', description: 'Enforces a mandatory 5-stage sequence for every coding task (user)', argumentHint: '' },
          { name: 'מיומנות-שלי', description: 'סקיל לדוגמה בעברית', argumentHint: '' },
        ] });
        toWebview({ type: 'models', current: 'default', models: [
          { value: 'default', displayName: 'Default (recommended)', description: 'Opus 4.8 · best for complex work' },
          { value: 'sonnet', displayName: 'Sonnet', description: 'Fast and capable' },
          { value: 'haiku', displayName: 'Haiku', description: 'Fastest' },
        ] });
        toWebview({ type: 'context', used: 23400, max: 64000 });
        states();
        // ?conv=c2 shows another conversation; ?open=drawer|mcp|slash opens that part (for screenshots).
        later(60, () => {
          const q = new URLSearchParams(location.search);
          if (q.get('conv')) switchTo(q.get('conv'));
          const open = { drawer: 'drawer-btn', mcp: 'mcp-btn', slash: 'slash-btn', attach: 'attach-btn', mode: 'mode-btn' }[q.get('open')];
          if (open) later(80, () => document.getElementById(open).click());
        });
        break;
      case 'send':
        if (/שאלה/.test(msg.text)) {
          toWebview({ type: 'permission', requestId: `q${++n}`, tool: 'AskUserQuestion', input: { questions: [{ header: 'גישה', question: 'איך לטפל בשגיאה?', multiSelect: false, options: [{ label: 'לזרוק הלאה', description: 'הקורא יחליט' }, { label: 'לרשום ביומן ולהמשיך', description: 'בטוח יותר' }] }] } });
        } else if (/תוכנית|plan/.test(msg.text)) {
          toWebview({ type: 'permission', requestId: `p${++n}`, tool: 'ExitPlanMode', input: { plan: '## תוכנית\n\n1. לקרוא את הקוד\n2. לכתוב בדיקה\n3. לתקן' } });
        } else if (/שגיאה|error/.test(msg.text)) {
          later(300, () => toWebview({ type: 'events', events: [{ kind: 'result', isError: true, errorText: 'Not logged in · Please run /login', durationMs: 80 }] }));
        } else {
          turn(msg.text);
        }
        break;
      case 'permissionAnswer':
        later(200, () => {
          toWebview({ type: 'events', events: [{ kind: 'toolResult', toolUseId: `${msg.requestId.replace('-perm', '')}-bash`, text: msg.behavior === 'allow' ? '12 passing' : msg.message || 'denied', isError: msg.behavior !== 'allow' }] });
          stream(`r${++n}`, 'סיימתי. **כל הבדיקות עברו.**', result);
        });
        break;
      case 'interrupt':
        toWebview({ type: 'events', events: [{ kind: 'result', isError: false, interrupted: true, durationMs: 1200 }] });
        break;
      case 'setMode':
        toWebview({ type: 'mode', value: msg.value });
        break;
      case 'setModel':
        toWebview({ type: 'model', value: msg.value });
        break;
      case 'openSession':
        toWebview({ type: 'sessionLoaded', id: msg.id, title: 'תיקון באג בתהליך ה-CLI', events: [
          { kind: 'user', key: 'h1', text: 'למה התוסף קורס כשאין claude ב-PATH?' },
          { kind: 'block', key: 'h2', blockType: 'text', text: 'כי `spawn` זורק `ENOENT` בלי מטפל. **הוספתי** `child.on(\'error\')`.' },
          { kind: 'tool', key: 'h3', id: 'h3', name: 'Grep', input: { pattern: 'spawn\\(', path: 'C:\\proj\\src' }, final: true },
          { kind: 'toolResult', toolUseId: 'h3', text: 'src/cli/spawn.js:22', isError: false },
          { kind: 'result', isError: false, durationMs: 15300 },
        ] });
        break;
      default:
        console.log('host got', msg);
    }
  }

  window.acquireVsCodeApi = () => ({ postMessage: (m) => setTimeout(() => handle(m), 0), getState: () => null, setState: () => {} });
})();
