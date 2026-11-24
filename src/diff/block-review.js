// Per-block approval of an Edit/Write permission request (package F, R-1): opens the shared diff view
// (diff-view.js) and shows always-visible accept/reject buttons per block: comment threads on the proposed
// side (block-comments.js), accept-all/reject-all in the editor title, accept/reject-at-cursor commands, and
// CodeLens for users with `diffEditor.codeLens` on. Blocks start pending; the decision goes back to the CLI as
// the permission answer, with `updatedInput` holding only the kept blocks (blocks.js), when the last block is
// decided. Nothing is written to disk by us.
const vscode = require('vscode');
const nodePath = require('path');
const { SCHEME } = require('./diff-view');
const blocks = require('./blocks');
const { createBlockState, shouldShowThreads } = require('./block-state');
const { createBlockComments, STATE_LABEL } = require('./block-comments');

const PREFIX = 'claude-local.blockReview.';
const CONTEXT_KEY = 'claude-local:blockReviewActive'; // true while the active tab is a review diff
const TOO_MANY_MESSAGE = 'יש יותר מ-100 שינויים, ולכן לא מוצגים כפתורי אישור ודחייה לכל שינוי. השתמשו בכפתורי כותרת העורך או בפקודות "אישור/דחיית השינוי שבמיקום הסמן".';
const STATE_ICON = { pending: '$(circle-outline)', accepted: '$(pass-filled)', rejected: '$(circle-slash)' };

function createBlockReview(diffView) {
  const reviews = new Map(); // right-document path -> review
  const leftToRight = new Map(); // left-document path -> right-document path
  const changed = new vscode.EventEmitter();
  const comments = createBlockComments();
  const opening = new Set(); // reviews whose diff tab is still opening: {key, cancelled}
  let seq = 0;

  const byId = (id) => [...reviews.values()].find((r) => r.id === id);
  const reviewAt = (path) => reviews.get(path) || reviews.get(leftToRight.get(path));
  const isDiffTab = (tab) => tab.input instanceof vscode.TabInputTextDiff;
  function activeReview() {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    return tab && isDiffTab(tab) ? reviews.get(tab.input.modified.path) : undefined;
  }
  // The review a command is meant for: a review id, a document Uri (editor title), or the active tab.
  function resolveReview(arg) {
    if (typeof arg === 'number') return byId(arg);
    if (arg && typeof arg.path === 'string') return reviewAt(arg.path);
    return activeReview();
  }
  // `/diff` tabs use the same scheme, so the title buttons key off this, not off the scheme alone.
  const updateContext = () => vscode.commands.executeCommand('setContext', CONTEXT_KEY, Boolean(activeReview()));

  // Ends the review: the promise of review() settles with `result` (the tab is left to the caller). It
  // settles before the UI cleanup, so a failing cleanup cannot leave the permission card waiting.
  function end(r, result) {
    reviews.delete(r.path);
    leftToRight.delete(r.leftPath);
    r.resolve(result);
    try {
      comments.hide(r);
    } finally {
      changed.fire();
      updateContext();
    }
  }
  async function closeTab(r) {
    const open = vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => isDiffTab(t) && t.input.modified.path === r.path);
    for (const tab of open) await vscode.window.tabGroups.close(tab);
  }
  // send: the decision goes to the CLI (every block must be decided); otherwise the review is cancelled (null).
  async function finish(r, send) {
    try {
      end(r, send ? blocks.decision(r.tool, r.input, r.texts, r.blocks, r.state.accepted()) : null);
    } finally {
      await closeTab(r);
    }
  }
  function decideBlock(r, k, accept) {
    if (!r.state.decide(k, accept)) return undefined;
    if (r.state.isComplete()) return finish(r, true);
    comments.refresh(r);
    changed.fire();
    return undefined;
  }
  function decideRest(r, accept) {
    r.state.decideRest(accept);
    return finish(r, true);
  }
  function decideThread(thread, accept) {
    const ref = comments.refOf(thread);
    const r = ref && byId(ref.id);
    return r ? decideBlock(r, ref.k, accept) : undefined;
  }
  // The block under the cursor, in the proposed or the original document of a review.
  function decideAtCursor(accept) {
    const editor = vscode.window.activeTextEditor;
    const r = editor && reviewAt(editor.document.uri.path);
    const side = r && editor.document.uri.path === r.path ? 'right' : 'left';
    const k = r ? r.state.blockAtLine(side, editor.selection.active.line) : -1;
    if (k < 0) {
      vscode.window.showInformationMessage('הסמן אינו על שינוי');
      return undefined;
    }
    return decideBlock(r, k, accept);
  }
  const onReview = (fn) => (arg) => {
    const r = resolveReview(arg);
    return r ? fn(r) : undefined;
  };

  const handlers = {
    decide: (id, k, accept) => { const r = byId(id); return r ? decideBlock(r, k, accept) : undefined; },
    acceptThread: (thread) => decideThread(thread, true),
    rejectThread: (thread) => decideThread(thread, false),
    acceptAll: onReview((r) => decideRest(r, true)),
    rejectAll: onReview((r) => decideRest(r, false)),
    cancel: onReview((r) => finish(r, false)),
    acceptAtCursor: () => decideAtCursor(true),
    rejectAtCursor: () => decideAtCursor(false),
  };
  const commands = Object.entries(handlers).map(([name, fn]) => vscode.commands.registerCommand(PREFIX + name, fn));

  // VS Code hides CodeLens in diff editors unless `diffEditor.codeLens` is on (default off); we do not change
  // the user's settings, so for everyone else the threads and title buttons are the way to decide.
  const lensProvider = vscode.languages.registerCodeLensProvider({ scheme: SCHEME }, {
    onDidChangeCodeLenses: changed.event,
    provideCodeLenses(doc) {
      const r = reviews.get(doc.uri.path);
      if (!r) return [];
      const top = new vscode.Range(0, 0, 0, 0);
      const lens = (range, title, command, args) => new vscode.CodeLens(range, { title, command, arguments: args });
      const lenses = [
        lens(top, '$(check-all) אישור הנותרים ושליחה', `${PREFIX}acceptAll`, [r.id]),
        lens(top, '$(close-all) דחיית הנותרים ושליחה', `${PREFIX}rejectAll`, [r.id]),
        lens(top, '$(close) ביטול סקירה', `${PREFIX}cancel`, [r.id]),
      ];
      const states = r.state.states();
      r.blocks.forEach((_, k) => {
        const line = r.state.lineRange(k).start;
        const range = new vscode.Range(line, 0, line, 0);
        lenses.push(lens(range, `${STATE_ICON[states[k]]} בלוק ${k + 1}/${r.blocks.length}: ${STATE_LABEL[states[k]]}`, '', []));
        lenses.push(lens(range, '$(check) אישור', `${PREFIX}decide`, [r.id, k, true]));
        lenses.push(lens(range, '$(close) דחייה', `${PREFIX}decide`, [r.id, k, false]));
      });
      return lenses;
    },
  });
  // The user closing a review tab by hand ends the review (null: the permission card stays open). Moving a
  // tab to another group reports closed + opened, so the review ends only when no tab of it remains.
  const hasOpenTab = (r) => vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => isDiffTab(t) && t.input.modified.path === r.path));
  const tabWatch = vscode.window.tabGroups.onDidChangeTabs((e) => {
    for (const tab of e.closed) {
      const r = isDiffTab(tab) ? reviews.get(tab.input.modified.path) : undefined;
      if (r && !hasOpenTab(r)) end(r, null);
    }
    updateContext();
  });
  const editorWatch = vscode.window.onDidChangeActiveTextEditor(updateContext);

  return {
    // Resolves to {behavior, updatedInput|message, partial?}, or null when the user cancelled the
    // review or closed its tab (the card stays open). Returns null at once when the call cannot be
    // reviewed by block. `key` names the permission request, for cancel().
    async review({ key, tool, input, fileText, filePath }) {
      const texts = blocks.reviewTexts(tool, input, fileText);
      if (!texts) return null;
      const list = blocks.diffBlocks(texts.before, texts.after);
      if (!list.length) return null;
      seq += 1;
      const id = seq;
      // A cancel(key) or dispose() that arrives while the diff is still opening marks this entry.
      const starting = { key, cancelled: false };
      opening.add(starting);
      let uris;
      try {
        uris = await diffView.show({ left: texts.fullBefore, right: texts.fullAfter, filePath, title: `${nodePath.basename(filePath)} (סקירה לפי בלוקים)` });
      } finally {
        opening.delete(starting);
      }
      if (starting.cancelled) return null; // the tab stays open, as with cancel(key) on a running review
      const { leftUri, rightUri } = uris;
      if (!shouldShowThreads(list.length)) vscode.window.showInformationMessage(TOO_MANY_MESSAGE);
      return new Promise((resolve) => {
        const state = createBlockState(list, texts.lineOffset, texts.fullAfter.split('\n').length);
        const r = { id, key, path: rightUri.path, leftPath: leftUri.path, rightUri, tool, input, texts, blocks: list, state, resolve };
        reviews.set(r.path, r);
        leftToRight.set(r.leftPath, r.path);
        comments.show(r);
        updateContext();
        changed.fire();
      });
    },
    // The permission was answered or cancelled elsewhere: drop its open review (the tab stays open).
    cancel(key) {
      for (const s of opening) if (s.key === key) s.cancelled = true;
      for (const r of [...reviews.values()]) if (r.key === key) end(r, null);
    },
    dispose() {
      for (const s of opening) s.cancelled = true;
      for (const r of [...reviews.values()]) end(r, null);
      [lensProvider, tabWatch, editorWatch, comments, changed, ...commands].forEach((d) => d.dispose());
    },
  };
}

module.exports = { createBlockReview };
