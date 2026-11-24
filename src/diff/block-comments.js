// Per-block comment threads for the review diff (R-1): one thread per block on the proposed document,
// holding trusted markdown accept/reject links in the body and the block state as the thread's contextValue
// (the thread title icons in package.json key off it). Not shown above MAX_THREAD_BLOCKS blocks.
const vscode = require('vscode');
const { shouldShowThreads } = require('./block-state');

const CONTROLLER_ID = 'claude-local.blockReview';
const DECIDE = 'claude-local.blockReview.decide';
const STATE_LABEL = { pending: 'ממתין', accepted: 'אושר', rejected: 'נדחה' };

// The comment of block k of review r: two markdown links that run the decide command with (id, k, accept).
function commentFor(r, k) {
  const link = (accept, title) => `[${title}](command:${DECIDE}?${encodeURIComponent(JSON.stringify([r.id, k, accept]))})`;
  const body = new vscode.MarkdownString(`${link(true, '$(check) אישור')} | ${link(false, '$(close) דחייה')}`, true);
  body.isTrusted = { enabledCommands: [DECIDE] };
  return { body, mode: vscode.CommentMode.Preview, author: { name: 'Claude Code Local' } };
}

// Returns {show(r), refresh(r), hide(r), refOf(thread) -> {id, k} | undefined, dispose()}.
// r: a review {id, rightUri, blocks, state} from block-review.js.
function createBlockComments() {
  const controller = vscode.comments.createCommentController(CONTROLLER_ID, 'סקירה לפי בלוקים');
  const byReview = new Map(); // review id -> threads, index = block
  const refs = new Map(); // thread -> {id, k}

  function apply(r, thread, k, state) {
    thread.comments = [commentFor(r, k)];
    thread.label = `בלוק ${k + 1}/${r.blocks.length} · ${STATE_LABEL[state]}`;
    thread.contextValue = state;
  }

  return {
    show(r) {
      if (!shouldShowThreads(r.blocks.length)) return;
      const states = r.state.states();
      byReview.set(r.id, r.blocks.map((_, k) => {
        const { start, end } = r.state.lineRange(k);
        const thread = controller.createCommentThread(r.rightUri, new vscode.Range(start, 0, end, 0), []);
        thread.canReply = false;
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
        apply(r, thread, k, states[k]);
        refs.set(thread, { id: r.id, k });
        return thread;
      }));
    },
    refresh(r) {
      const states = r.state.states();
      (byReview.get(r.id) || []).forEach((thread, k) => apply(r, thread, k, states[k]));
    },
    hide(r) {
      for (const thread of byReview.get(r.id) || []) {
        refs.delete(thread);
        thread.dispose();
      }
      byReview.delete(r.id);
    },
    refOf: (thread) => refs.get(thread),
    dispose() {
      for (const threads of byReview.values()) threads.forEach((t) => t.dispose());
      byReview.clear();
      refs.clear();
      controller.dispose();
    },
  };
}

module.exports = { createBlockComments, STATE_LABEL };
