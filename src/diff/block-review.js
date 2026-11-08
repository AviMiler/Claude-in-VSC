// Per-block approval of an Edit/Write permission request (package F): opens the shared diff view
// (diff-view.js) and puts CodeLens buttons on the proposed side: one toggle per block and, on the
// first line, "send" and "cancel". The result goes back to the CLI as the permission answer, with
// `updatedInput` holding only the kept blocks (blocks.js). Nothing is written to disk by us.
const vscode = require('vscode');
const nodePath = require('path');
const { SCHEME } = require('./diff-view');
const blocks = require('./blocks');

// The CodeLens-less route: every block is an item, all checked; Enter sends, Esc cancels (null).
async function pickBlocks({ tool, input, texts, list, lineOffset }) {
  const items = list.map((blk, k) => {
    const first = lineOffset + blk.newStart + 1;
    const where = blk.newCount ? `שורות ${first}–${first + blk.newCount - 1}` : `לפני שורה ${first}`;
    const preview = (blk.newLines.find((l) => l.trim()) || '(מחיקה)').trim().slice(0, 80);
    return { label: `בלוק ${k + 1}: ${where}`, description: `+${blk.newCount} −${blk.oldCount}`, detail: preview, picked: true, index: k };
  });
  const chosen = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    ignoreFocusOut: true,
    title: 'אישור לפי בלוקים: הסירו את הסימון מבלוקים לדחייה, Enter לשליחה ל-Claude, Esc לביטול',
  });
  if (!chosen) return null;
  const accepted = list.map((_, k) => chosen.some((c) => c.index === k));
  return blocks.decision(tool, input, texts, list, accepted);
}

function createBlockReview(diffView) {
  const reviews = new Map(); // right-document path -> review
  const changed = new vscode.EventEmitter();
  let seq = 0;

  const lensProvider = vscode.languages.registerCodeLensProvider({ scheme: SCHEME }, {
    onDidChangeCodeLenses: changed.event,
    provideCodeLenses(doc) {
      const r = reviews.get(doc.uri.path);
      if (!r) return [];
      const kept = r.accepted.filter(Boolean).length;
      const top = new vscode.Range(0, 0, 0, 0);
      const lenses = [
        new vscode.CodeLens(top, { title: `$(check-all) שלח החלטה ל-Claude (${kept}/${r.blocks.length} בלוקים)`, command: 'claude-local.blockReview.finish', arguments: [r.id, true] }),
        new vscode.CodeLens(top, { title: '$(close) בטל סקירה', command: 'claude-local.blockReview.finish', arguments: [r.id, false] }),
      ];
      r.blocks.forEach((blk, k) => {
        const line = Math.min(r.lineOffset + blk.newStart, Math.max(doc.lineCount - 1, 0));
        const title = r.accepted[k] ? `$(pass-filled) בלוק ${k + 1}: יאושר (לחיצה לדחייה)` : `$(circle-slash) בלוק ${k + 1}: יידחה (לחיצה לאישור)`;
        lenses.push(new vscode.CodeLens(new vscode.Range(line, 0, line, 0), { title, command: 'claude-local.blockReview.toggle', arguments: [r.id, k] }));
      });
      return lenses;
    },
  });

  const byId = (id) => [...reviews.values()].find((r) => r.id === id);
  const end = (r, result) => {
    reviews.delete(r.path);
    changed.fire();
    r.resolve(result);
  };
  const commands = [
    vscode.commands.registerCommand('claude-local.blockReview.toggle', (id, k) => {
      const r = byId(id);
      if (!r || !(k in r.accepted)) return;
      r.accepted[k] = !r.accepted[k];
      changed.fire();
    }),
    vscode.commands.registerCommand('claude-local.blockReview.finish', async (id, send) => {
      const r = byId(id);
      if (!r) return;
      end(r, send ? blocks.decision(r.tool, r.input, r.texts, r.blocks, r.accepted) : null);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }),
  ];

  return {
    // Resolves to {behavior, updatedInput|message, partial?}, or null when the user cancelled the
    // review (the card stays open). Returns null at once when the call cannot be reviewed by block.
    // `key` names the permission request, for cancel().
    async review({ key, tool, input, fileText, filePath }) {
      const texts = blocks.reviewTexts(tool, input, fileText);
      if (!texts) return null;
      const list = blocks.diffBlocks(texts.before, texts.after);
      if (!list.length) return null;
      seq += 1;
      const { rightUri } = await diffView.show({ left: texts.fullBefore, right: texts.fullAfter, filePath, title: `${nodePath.basename(filePath)} (סקירה לפי בלוקים)` });
      // VS Code hides CodeLens in diff editors unless `diffEditor.codeLens` is on (default off); we do
      // not change the user's settings, so the blocks are then chosen in a multi-select list instead.
      if (!vscode.workspace.getConfiguration('diffEditor').get('codeLens')) {
        return pickBlocks({ tool, input, texts, list, lineOffset: texts.lineOffset });
      }
      return new Promise((resolve) => {
        reviews.set(rightUri.path, {
          id: seq, key, path: rightUri.path, tool, input, texts, blocks: list,
          accepted: list.map(() => true), lineOffset: texts.lineOffset, resolve,
        });
        changed.fire();
      });
    },
    // The permission was answered or cancelled elsewhere: drop its open review (the tab stays open).
    cancel(key) {
      for (const r of [...reviews.values()]) if (r.key === key) end(r, null);
    },
    dispose() {
      for (const r of [...reviews.values()]) end(r, null);
      lensProvider.dispose();
      commands.forEach((c) => c.dispose());
      changed.dispose();
    },
  };
}

module.exports = { createBlockReview };
