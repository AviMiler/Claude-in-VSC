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
    toWebview({ type: 'events', events: [{ kind: 'result', isError: false, durationMs: 8421, costUsd: 0.0213, inputTokens: 18400, outputTokens: 912 }] });
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

  function handle(msg) {
    switch (msg.type) {
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
      case 'listHistory': {
        const now = Date.now();
        later(150, () => toWebview({ type: 'history', currentId: 'b', items: [
          { id: 'a', title: 'תיקון באג בתהליך ה-CLI', mtime: now - 5 * 60e3 },
          { id: 'b', title: 'Refactor the auth middleware to support JWT', mtime: now - 3 * 3600e3 },
          { id: 'c', title: 'הוספת היסטוריית שיחות', mtime: now - 26 * 3600e3 },
          { id: 'd', title: 'סנכרון עם GitHub', mtime: now - 4 * 86400e3 },
          { id: 'e', title: 'Explain the webview CSP', mtime: now - 20 * 86400e3 },
        ] }));
        break;
      }
      case 'openSession':
        toWebview({ type: 'sessionLoaded', id: msg.id, title: 'תיקון באג בתהליך ה-CLI', events: [
          { kind: 'user', key: 'h1', text: 'למה התוסף קורס כשאין claude ב-PATH?' },
          { kind: 'block', key: 'h2', blockType: 'text', text: 'כי `spawn` זורק `ENOENT` בלי מטפל. **הוספתי** `child.on(\'error\')`.' },
          { kind: 'tool', key: 'h3', id: 'h3', name: 'Grep', input: { pattern: 'spawn\\(', path: 'C:\\proj\\src' }, final: true },
          { kind: 'toolResult', toolUseId: 'h3', text: 'src/cli/spawn.js:22', isError: false },
          { kind: 'result', isError: false, durationMs: 15300, costUsd: 0.04 },
        ] });
        break;
      case 'newConversation':
        toWebview({ type: 'reset' });
        break;
      default:
        console.log('host got', msg);
    }
  }

  window.acquireVsCodeApi = () => ({ postMessage: (m) => setTimeout(() => handle(m), 0), getState: () => null, setState: () => {} });
})();
