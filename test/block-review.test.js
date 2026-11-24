// Per-block review (R-1) against a stubbed `vscode`: the decision is sent only when the last block is decided,
// the buttons (comment-thread links, thread commands, CodeLens, title commands) change the right blocks, and
// closing, cancelling or disposing ends the review.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

// ---- vscode stub: only what block-review.js and block-comments.js use ----
const registered = {}; // command id -> handler
const contextValues = {}; // setContext key -> last value
const threads = []; // every comment thread ever created (with .disposed)
const infos = []; // showInformationMessage texts
let lensProvider = null;
let activeTab;
const groupTabs = [];
const tabEvents = [];
const editorEvents = [];
const stubEmitter = (list) => ({
  event: (h) => { list.push(h); return { dispose() { list.splice(list.indexOf(h), 1); } }; },
  fire: (e) => [...list].forEach((h) => h(e)),
});
const tabs = stubEmitter(tabEvents);
const editors = stubEmitter(editorEvents);

class EventEmitter {
  constructor() { this.handlers = []; this.event = (h) => { this.handlers.push(h); return { dispose() {} }; }; }
  fire(e) { this.handlers.forEach((h) => h(e)); }
  dispose() {}
}
class Range { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } }
class CodeLens { constructor(range, command) { this.range = range; this.command = command; } }
class MarkdownString {
  constructor(value, supportThemeIcons) { this.value = value || ''; this.supportThemeIcons = supportThemeIcons; this.isTrusted = false; }
  appendMarkdown(s) { this.value += s; return this; }
}
class TabInputTextDiff { constructor(original, modified) { this.original = original; this.modified = modified; } }

const vscodeStub = {
  EventEmitter, Range, CodeLens, MarkdownString, TabInputTextDiff,
  CommentThreadCollapsibleState: { Collapsed: 0, Expanded: 1 },
  CommentMode: { Editing: 0, Preview: 1 },
  commands: {
    registerCommand: (id, fn) => { registered[id] = fn; return { dispose() {} }; },
    executeCommand: async (id, ...args) => { if (id === 'setContext') contextValues[args[0]] = args[1]; },
  },
  comments: {
    createCommentController: (id) => {
      controllerIds.push(id);
      return {
        createCommentThread(uri, range, comments) {
          const t = { uri, range, comments, canReply: true, dispose() { t.disposed = true; } };
          threads.push(t);
          return t;
        },
        dispose() {},
      };
    },
  },
  languages: { registerCodeLensProvider: (sel, provider) => { lensProvider = provider; return { dispose() {} }; } },
  window: {
    activeTextEditor: undefined,
    showInformationMessage: async (m) => { infos.push(m); },
    onDidChangeActiveTextEditor: editors.event,
    tabGroups: {
      get all() { return [{ tabs: groupTabs }]; },
      get activeTabGroup() { return { activeTab }; },
      onDidChangeTabs: tabs.event,
      async close(tab) {
        groupTabs.splice(groupTabs.indexOf(tab), 1);
        activeTab = groupTabs[groupTabs.length - 1];
        tabs.fire({ opened: [], closed: [tab], changed: [] });
        return true;
      },
    },
  },
};
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? 'vscode-stub' : resolveFilename.call(this, request, ...rest);
};
require.cache['vscode-stub'] = { id: 'vscode-stub', filename: 'vscode-stub', loaded: true, exports: vscodeStub };
const { createBlockReview } = require('../src/diff/block-review');

// ---- fixtures and helpers ----
const KEY = 'claude-local:blockReviewActive';
const tick = () => new Promise((r) => setImmediate(r));
let current = null;
let shown = 0;
let gate = null; // when set, diffView.show waits for it after opening the tab
const controllerIds = [];

// Opens a diff tab like the real diff view: left /N/before/a.js, right /N/after/a.js.
const diffView = {
  async show() {
    shown += 1;
    const leftUri = { scheme: 'claude-local-diff', path: `/${shown}/before/a.js` };
    const rightUri = { scheme: 'claude-local-diff', path: `/${shown}/after/a.js` };
    activeTab = { input: new TabInputTextDiff(leftUri, rightUri) };
    groupTabs.push(activeTab);
    tabs.fire({ opened: [activeTab], closed: [], changed: [] });
    if (gate) await gate;
    return { leftUri, rightUri };
  },
};

// Three separate one-line changes: b->B, d->D, f->F (blocks 0, 1, 2 at new lines 1, 3, 5).
const SEVEN = 'a\nb\nc\nd\ne\nf\ng';
const THREE_CHANGES = 'a\nB\nc\nD\ne\nF\ng';
// `n` separate one-line changes in a 2n-line file.
function manyChanges(n) {
  const before = Array.from({ length: 2 * n }, (_, j) => `l${j}`);
  const after = before.map((l, j) => (j % 2 === 0 ? `L${j}` : l));
  return { fileText: before.join('\n'), content: after.join('\n') };
}

// Starts a review on the current instance. `input` overrides the default Write input; `gated` holds the
// diff view open (out.release() lets it finish) to simulate a cancel that arrives while the tab is opening.
async function begin({ key = 'req1', tool = 'Write', fileText = SEVEN, content = THREE_CHANGES, input, gated = false } = {}) {
  const inp = input || { file_path: '/p/a.js', content };
  const out = { input: inp, settled: false, result: undefined };
  if (gated) gate = new Promise((resolve) => { out.release = () => { gate = null; resolve(); }; });
  out.promise = current.review({ key, tool, input: inp, fileText, filePath: '/p/a.js' }).then((v) => { out.settled = true; out.result = v; return v; });
  await tick();
  out.right = { scheme: 'claude-local-diff', path: `/${shown}/after/a.js` };
  out.left = { scheme: 'claude-local-diff', path: `/${shown}/before/a.js` };
  return out;
}
// A fresh instance and a clean stub, then one review.
async function start(opts = {}) {
  if (current) current.dispose();
  Object.keys(contextValues).forEach((k) => delete contextValues[k]);
  threads.length = 0;
  infos.length = 0;
  groupTabs.length = 0;
  activeTab = undefined;
  gate = null;
  vscodeStub.window.activeTextEditor = undefined;
  current = createBlockReview(diffView);
  return begin(opts);
}
const threadsOf = (s) => live().filter((t) => t.uri.path === s.right.path);
const cursorAt = (uri, line) => { vscodeStub.window.activeTextEditor = { document: { uri }, selection: { active: { line } } }; };
const run = async (command, ...args) => { await registered[`claude-local.blockReview.${command}`](...args); await tick(); };
const live = () => threads.filter((t) => !t.disposed);
// The markdown buttons of a thread: [{command, args}] in the body of its comment.
function links(thread) {
  const body = thread.comments[0].body;
  return [...body.value.matchAll(/\(command:([\w.-]+)\?([^)]+)\)/g)].map((m) => ({ command: m[1], args: JSON.parse(decodeURIComponent(m[2])), body }));
}
async function clickLink(thread, accept) {
  const link = links(thread).find((l) => l.args[2] === accept);
  assert.ok(link.body.isTrusted.enabledCommands.includes(link.command), 'the link command is allowed in the trusted markdown');
  await registered[link.command](...link.args);
  await tick();
}

// ---- tests ----
test('the decision is sent only after the last block is decided, with the kept blocks merged', async () => {
  const s = await start();
  await run('decide', 1, 0, true);
  await run('decide', 1, 1, false);
  assert.strictEqual(s.settled, false);
  await run('decide', 1, 2, true);
  assert.strictEqual(s.settled, true);
  assert.strictEqual(s.result.behavior, 'allow');
  assert.strictEqual(s.result.updatedInput.content, 'a\nB\nc\nd\ne\nF\ng');
  assert.deepStrictEqual(s.result.partial, { kept: 2, total: 3 });
});

test('a block decided twice keeps the last choice', async () => {
  const s = await start();
  await run('decide', 1, 0, true);
  await run('decide', 1, 0, false);
  await run('decide', 1, 1, true);
  await run('decide', 1, 2, true);
  assert.strictEqual(s.result.updatedInput.content, 'a\nb\nc\nD\ne\nF\ng');
});

test('accept all keeps earlier rejections, decides the rest and sends', async () => {
  const s = await start();
  await run('decide', 1, 1, false);
  await run('acceptAll', s.right);
  assert.strictEqual(s.result.updatedInput.content, 'a\nB\nc\nd\ne\nF\ng');
  assert.deepStrictEqual(s.result.partial, { kept: 2, total: 3 });
});

test('reject all keeps earlier acceptances, decides the rest and sends', async () => {
  const s = await start();
  await run('decide', 1, 0, true);
  await run('rejectAll', s.right);
  assert.strictEqual(s.result.updatedInput.content, 'a\nB\nc\nd\ne\nf\ng');
  assert.deepStrictEqual(s.result.partial, { kept: 1, total: 3 });
});

test('reject all with nothing accepted denies; accept all with nothing rejected allows the original input', async () => {
  const denied = await start();
  await run('rejectAll', denied.right);
  assert.strictEqual(denied.result.behavior, 'deny');
  assert.strictEqual(denied.result.partial, undefined);
  const allowed = await start();
  await run('acceptAll', allowed.right);
  assert.strictEqual(allowed.result.behavior, 'allow');
  assert.strictEqual(allowed.result.updatedInput, allowed.input);
  assert.strictEqual(allowed.result.partial, undefined);
});

test('the title buttons also work when VS Code passes the original (left) document', async () => {
  const s = await start();
  await run('acceptAll', s.left);
  assert.strictEqual(s.result.behavior, 'allow');
});

test('without an argument the commands act on the review in the active tab', async () => {
  const s = await start();
  await run('rejectAll');
  assert.strictEqual(s.result.behavior, 'deny');
});

test('cancel ends the review with null and closes the diff tab', async () => {
  const s = await start();
  await run('decide', 1, 0, true);
  await run('cancel', s.right);
  assert.strictEqual(s.result, null);
  assert.strictEqual(groupTabs.length, 0);
  assert.strictEqual(live().length, 0);
});

test('cancel(key) from the conversation ends the review with null and leaves the tab open', async () => {
  const s = await start();
  current.cancel('req1');
  await tick();
  assert.strictEqual(s.result, null);
  assert.strictEqual(groupTabs.length, 1);
  assert.strictEqual(live().length, 0);
});

test('cancel(key) for another request leaves the review running', async () => {
  const s = await start();
  current.cancel('other');
  await tick();
  assert.strictEqual(s.settled, false);
  assert.strictEqual(live().length, 3);
});

test('closing the review tab while blocks are pending ends the review with null', async () => {
  const s = await start();
  await vscodeStub.window.tabGroups.close(groupTabs[0]);
  await tick();
  assert.strictEqual(s.settled, true);
  assert.strictEqual(s.result, null);
  assert.strictEqual(live().length, 0);
});

test('closing a different tab does not end the review', async () => {
  const s = await start();
  const other = { input: { uri: { path: '/x.js' } } };
  groupTabs.push(other);
  await vscodeStub.window.tabGroups.close(other);
  await tick();
  assert.strictEqual(s.settled, false);
});

test('finishing closes the diff tab and clears the context key', async () => {
  const s = await start();
  assert.strictEqual(contextValues[KEY], true);
  await run('acceptAll', s.right);
  assert.strictEqual(groupTabs.length, 0);
  assert.strictEqual(contextValues[KEY], false);
});

test('the context key is false while another diff tab is active', async () => {
  await start();
  const other = { input: new TabInputTextDiff({ path: '/9/before/b.js' }, { path: '/9/after/b.js' }) };
  groupTabs.push(other);
  activeTab = other;
  tabs.fire({ opened: [other], closed: [], changed: [] });
  assert.strictEqual(contextValues[KEY], false);
});

test('no block to review: null at once and no diff opens', async () => {
  const before = shown;
  const s = await start({ fileText: SEVEN, content: SEVEN });
  assert.strictEqual(s.result, null);
  assert.strictEqual(shown, before);
});

test('dispose ends open reviews with null', async () => {
  const s = await start();
  current.dispose();
  await tick();
  assert.strictEqual(s.result, null);
  assert.strictEqual(live().length, 0);
  current = null;
});

test('one comment thread per block, on the proposed document, starting pending', async () => {
  const s = await start();
  const t = live();
  assert.strictEqual(t.length, 3);
  assert.ok(t.every((x) => x.uri.path === s.right.path && x.contextValue === 'pending' && x.canReply === false));
  assert.deepStrictEqual(t.map((x) => x.range.start.line), [1, 3, 5]);
  assert.ok(t[1].label.includes('2/3'));
});

test('a markdown button in the thread decides its block and the thread shows the new state', async () => {
  const s = await start();
  const [t0, t1] = live();
  const pendingLabel = t1.label;
  await clickLink(t1, false);
  assert.strictEqual(t1.contextValue, 'rejected');
  assert.notStrictEqual(t1.label, pendingLabel);
  assert.strictEqual(t0.contextValue, 'pending');
  assert.strictEqual(s.settled, false);
  await clickLink(t1, true);
  assert.strictEqual(t1.contextValue, 'accepted');
});

test('the thread title commands accept and reject the block of the thread they receive', async () => {
  const s = await start();
  const [t0, t1, t2] = live();
  await run('acceptThread', t0);
  await run('rejectThread', t1);
  assert.deepStrictEqual([t0.contextValue, t1.contextValue, t2.contextValue], ['accepted', 'rejected', 'pending']);
  await run('acceptThread', t2);
  assert.strictEqual(s.result.updatedInput.content, 'a\nB\nc\nd\ne\nF\ng');
});

test('a thread command for a thread of another review is ignored', async () => {
  const s = await start();
  await run('acceptThread', { not: 'ours' });
  assert.strictEqual(s.settled, false);
  assert.ok(live().every((t) => t.contextValue === 'pending'));
});

test('accept at cursor decides the block under the cursor on the proposed side', async () => {
  const s = await start();
  vscodeStub.window.activeTextEditor = { document: { uri: s.right }, selection: { active: { line: 3 } } };
  await run('acceptAtCursor');
  assert.deepStrictEqual(live().map((t) => t.contextValue), ['pending', 'accepted', 'pending']);
});

test('reject at cursor works from the original (left) side too, by old line numbers', async () => {
  const s = await start();
  vscodeStub.window.activeTextEditor = { document: { uri: s.left }, selection: { active: { line: 5 } } };
  await run('rejectAtCursor');
  assert.deepStrictEqual(live().map((t) => t.contextValue), ['pending', 'pending', 'rejected']);
});

test('a cursor outside every change decides nothing and tells the user', async () => {
  const s = await start();
  vscodeStub.window.activeTextEditor = { document: { uri: s.right }, selection: { active: { line: 2 } } };
  await run('acceptAtCursor');
  assert.strictEqual(infos.length, 1);
  assert.ok(live().every((t) => t.contextValue === 'pending'));
});

test('above 100 blocks there are no threads, but the buttons in the editor title still work', async () => {
  const s = await start(manyChanges(101));
  assert.strictEqual(live().length, 0);
  await run('rejectAll', s.right);
  assert.strictEqual(s.result.behavior, 'deny');
});

test('exactly 100 blocks still get a thread each', async () => {
  await start(manyChanges(100));
  assert.strictEqual(live().length, 100);
});

test('CodeLens: no lenses for other documents; per block a status and two buttons, three buttons on top', async () => {
  const s = await start();
  assert.deepStrictEqual(lensProvider.provideCodeLenses({ uri: { path: '/other.js' }, lineCount: 7 }), []);
  const lenses = lensProvider.provideCodeLenses({ uri: s.right, lineCount: 7 });
  assert.strictEqual(lenses.length, 3 + 3 * 3);
  const rejectBlock1 = lenses.find((l) => l.command.command === 'claude-local.blockReview.decide' && l.command.arguments[1] === 1 && l.command.arguments[2] === false);
  await registered[rejectBlock1.command.command](...rejectBlock1.command.arguments);
  assert.strictEqual(live()[1].contextValue, 'rejected');
});

test('CodeLens refreshes when a block is decided', async () => {
  const s = await start();
  let fired = 0;
  lensProvider.onDidChangeCodeLenses(() => { fired += 1; });
  await run('decide', 1, 0, true);
  assert.ok(fired >= 1);
  assert.strictEqual(s.settled, false);
});

// ---- Edit with a line offset: the reviewed text starts at line 9 of a 20-line file ----
const TWENTY = Array.from({ length: 20 }, (_, j) => `l${j}`).join('\n');
const EDIT = { file_path: '/p/a.js', old_string: 'l9\nl10\nl11\nl12\nl13', new_string: 'l9\nA\nl11\nB\nl13' }; // blocks at lines 10 and 12
const stateLenses = (s) => lensProvider.provideCodeLenses({ uri: s.right, lineCount: 20 }).filter((l) => l.command.command === '');

test('Edit review: threads and CodeLens sit on the absolute lines of the file, not of the edited snippet', async () => {
  const s = await start({ tool: 'Edit', input: EDIT, fileText: TWENTY });
  assert.deepStrictEqual(threadsOf(s).map((t) => t.range.start.line), [10, 12]);
  assert.deepStrictEqual(stateLenses(s).map((l) => l.range.start.line), [10, 12]);
});

test('Edit review: accept at cursor takes the absolute line; the snippet-relative lines decide nothing', async () => {
  const s = await start({ tool: 'Edit', input: EDIT, fileText: TWENTY });
  for (const relative of [1, 3]) {
    cursorAt(s.right, relative);
    await run('acceptAtCursor');
  }
  assert.strictEqual(infos.length, 2);
  assert.deepStrictEqual(threadsOf(s).map((t) => t.contextValue), ['pending', 'pending']);
  cursorAt(s.right, 10);
  await run('acceptAtCursor');
  assert.deepStrictEqual(threadsOf(s).map((t) => t.contextValue), ['accepted', 'pending']);
});

test('Edit review: a partial decision rewrites new_string and keeps the rest of the input', async () => {
  const s = await start({ tool: 'Edit', input: EDIT, fileText: TWENTY });
  await run('decide', 1, 0, true);
  await run('decide', 1, 1, false);
  assert.strictEqual(s.result.updatedInput.new_string, 'l9\nA\nl11\nl12\nl13');
  assert.strictEqual(s.result.updatedInput.old_string, EDIT.old_string);
  assert.deepStrictEqual(s.result.partial, { kept: 1, total: 2 });
});

// ---- insertion and deletion blocks: block 0 inserts "NEW" (new line 1), block 1 deletes "e" (old line 4, before new line 5) ----
const INS_DEL = { fileText: 'a\nb\nc\nd\ne\nf', content: 'a\nNEW\nb\nc\nd\nf' };

test('insertion and deletion blocks: cursor commands on the proposed side', async () => {
  const s = await start(INS_DEL);
  cursorAt(s.right, 1);
  await run('acceptAtCursor');
  assert.deepStrictEqual(threadsOf(s).map((t) => t.contextValue), ['accepted', 'pending']);
  cursorAt(s.right, 5);
  await run('rejectAtCursor');
  assert.strictEqual(s.result.updatedInput.content, 'a\nNEW\nb\nc\nd\ne\nf');
});

test('insertion and deletion blocks: cursor commands on the original side', async () => {
  const s = await start(INS_DEL);
  cursorAt(s.left, 4); // the deleted line "e"
  await run('rejectAtCursor');
  assert.deepStrictEqual(threadsOf(s).map((t) => t.contextValue), ['pending', 'rejected']);
  cursorAt(s.left, 1); // where "NEW" is inserted
  await run('acceptAtCursor');
  assert.strictEqual(s.result.updatedInput.content, 'a\nNEW\nb\nc\nd\ne\nf');
});

// ---- two reviews at once ----
test('two reviews at once: a decision in one leaves the other untouched', async () => {
  const a = await start();
  const b = await begin({ key: 'req2' });
  await run('decide', 1, 0, true);
  assert.deepStrictEqual(threadsOf(a).map((t) => t.contextValue), ['accepted', 'pending', 'pending']);
  assert.deepStrictEqual(threadsOf(b).map((t) => t.contextValue), ['pending', 'pending', 'pending']);
});

test('two reviews at once: accept all without an argument ends only the active tab review, the other keeps its left document', async () => {
  const a = await start();
  const b = await begin({ key: 'req2' });
  await run('acceptAll');
  assert.strictEqual(b.settled, true);
  assert.strictEqual(a.settled, false);
  await run('acceptAll', a.left);
  assert.strictEqual(a.settled, true);
});

// ---- commands that arrive late or at the wrong place ----
test('commands arriving after the review ended do nothing and do not throw', async () => {
  const s = await start();
  const staleThread = live()[0];
  await run('acceptAll', s.right);
  const result = s.result;
  await run('decide', 1, 0, false);
  await run('acceptAll', s.left);
  await run('rejectAll', s.right);
  await run('cancel', s.right);
  await run('acceptThread', staleThread);
  assert.strictEqual(s.result, result);
  assert.strictEqual(result.behavior, 'allow');
});

test('cursor commands with no active editor tell the user and decide nothing', async () => {
  const s = await start();
  await run('acceptAtCursor');
  await run('rejectAtCursor');
  assert.strictEqual(infos.length, 2);
  assert.ok(threadsOf(s).every((t) => t.contextValue === 'pending'));
});

test('cursor commands in a document that is not under review tell the user and decide nothing', async () => {
  const s = await start();
  cursorAt({ scheme: 'file', path: '/p/a.js' }, 1);
  await run('acceptAtCursor');
  assert.strictEqual(infos.length, 1);
  assert.ok(threadsOf(s).every((t) => t.contextValue === 'pending'));
  assert.strictEqual(s.settled, false);
});

// ---- the context key and tab moves ----
test('the context key turns false when the user closes the review tab', async () => {
  await start();
  assert.strictEqual(contextValues[KEY], true);
  await vscodeStub.window.tabGroups.close(groupTabs[0]);
  assert.strictEqual(contextValues[KEY], false);
});

test('the context key turns false when the conversation cancels the review (the tab stays open)', async () => {
  await start();
  current.cancel('req1');
  assert.strictEqual(groupTabs.length, 1);
  assert.strictEqual(contextValues[KEY], false);
});

test('moving the review tab to another group (closed + opened) does not end the review', async () => {
  const s = await start();
  const original = groupTabs[0];
  const moved = { input: original.input };
  groupTabs.splice(0, 1, moved);
  activeTab = moved;
  tabs.fire({ opened: [moved], closed: [original], changed: [] });
  await tick();
  assert.strictEqual(s.settled, false);
  assert.strictEqual(threadsOf(s).length, 3);
  assert.strictEqual(contextValues[KEY], true);
  await vscodeStub.window.tabGroups.close(moved);
  await tick();
  assert.strictEqual(s.result, null);
});

// ---- cancel while the diff is still opening ----
test('cancel(key) while the diff tab is still opening: null, no threads, the tab is left open', async () => {
  const s = await start({ gated: true });
  current.cancel('req1');
  s.release();
  await tick();
  assert.strictEqual(s.settled, true);
  assert.strictEqual(s.result, null);
  assert.strictEqual(threads.length, 0);
  assert.strictEqual(groupTabs.length, 1);
  assert.notStrictEqual(contextValues[KEY], true);
});

test('cancel(key) for another request while the diff tab is opening does not stop the review', async () => {
  const s = await start({ gated: true });
  current.cancel('other');
  s.release();
  await tick();
  assert.strictEqual(s.settled, false);
  assert.strictEqual(threads.length, 3);
});

test('dispose while the diff tab is still opening: null and no threads', async () => {
  const s = await start({ gated: true });
  current.dispose();
  s.release();
  await tick();
  assert.strictEqual(s.result, null);
  assert.strictEqual(threads.length, 0);
  current = null;
});

// ---- more than 100 blocks ----
test('above 100 blocks a message says why there are no per-block buttons; up to 100 there is none', async () => {
  await start(manyChanges(101));
  assert.strictEqual(infos.length, 1);
  assert.ok(infos[0].includes('100'));
  await start(manyChanges(100));
  assert.strictEqual(infos.length, 0);
});

// ---- CodeLens top buttons and state lens ----
test('CodeLens top buttons run accept all, reject all and cancel for this review', async () => {
  const s = await start();
  const top = lensProvider.provideCodeLenses({ uri: s.right, lineCount: 7 }).filter((l) => l.range.start.line === 0);
  assert.deepStrictEqual(top.map((l) => [l.command.command.split('.').pop(), l.command.arguments]), [['acceptAll', [1]], ['rejectAll', [1]], ['cancel', [1]]]);
  const cancel = top[2].command;
  await registered[cancel.command](...cancel.arguments);
  assert.strictEqual(await s.promise, null);
});

test('CodeLens state lens changes with each decision', async () => {
  const s = await start();
  const title = () => lensProvider.provideCodeLenses({ uri: s.right, lineCount: 7 }).filter((l) => l.command.command === '')[1].command.title;
  const pending = title();
  await run('decide', 1, 1, true);
  const accepted = title();
  await run('decide', 1, 1, false);
  const rejected = title();
  assert.strictEqual(new Set([pending, accepted, rejected]).size, 3);
});

// ---- manifest: package.json and the code agree ----
test('manifest: contributed blockReview commands have handlers and the menus use the context key, controller id and states the code sets', async () => {
  const pkg = require('../package.json');
  const { SCHEME } = require('../src/diff/diff-view');
  const s = await start();
  const mine = (items) => items.filter((i) => (i.command || i).startsWith('claude-local.blockReview.'));
  for (const c of mine(pkg.contributes.commands.map((x) => x.command))) assert.strictEqual(typeof registered[c], 'function', c);
  const [contextKey] = Object.keys(contextValues);
  const titleMenu = mine(pkg.contributes.menus['editor/title']);
  assert.ok(titleMenu.length > 0);
  for (const m of titleMenu) assert.ok(m.when.includes(contextKey) && m.when.includes(`resourceScheme == ${SCHEME}`), m.command);
  const threadMenu = pkg.contributes.menus['comments/commentThread/title'];
  for (const m of threadMenu) assert.ok(m.when.includes(`commentController == ${controllerIds[controllerIds.length - 1]}`), m.command);
  const [t0, t1] = threadsOf(s);
  await run('acceptThread', t0);
  await run('rejectThread', t1);
  const whenOf = (command) => threadMenu.find((m) => m.command === command).when;
  assert.ok(whenOf('claude-local.blockReview.acceptThread').includes(`commentThread != ${t0.contextValue}`));
  assert.ok(whenOf('claude-local.blockReview.rejectThread').includes(`commentThread != ${t1.contextValue}`));
});

test('a failing UI cleanup does not stop the decision from reaching the conversation', async () => {
  const s = await start();
  live()[0].dispose = () => { throw new Error('cleanup failed'); };
  await assert.rejects(run('acceptAll', s.right), /cleanup failed/);
  assert.strictEqual(s.settled, true);
  assert.strictEqual(s.result.behavior, 'allow');
  assert.strictEqual(groupTabs.length, 0);
});
