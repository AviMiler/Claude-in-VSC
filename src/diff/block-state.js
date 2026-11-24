// Pure state of one per-block review (R-1): which blocks are pending, accepted or rejected, when the
// review is complete, and which block a cursor line belongs to. No vscode here, so it is unit-tested directly.

const MAX_THREAD_BLOCKS = 100; // above this many blocks no per-block comment threads are shown

function shouldShowThreads(blockCount) {
  return blockCount <= MAX_THREAD_BLOCKS;
}

// list: blocks from blocks.diffBlocks (0-based, relative to the reviewed text); lineOffset: the line of the
// reviewed text inside the whole file; rightLineCount: lines of the whole proposed document.
// Returns {states, decide, decideRest, isComplete, accepted, blockAtLine, lineRange}.
function createBlockState(list, lineOffset, rightLineCount) {
  const state = list.map(() => 'pending'); // 'pending' | 'accepted' | 'rejected'
  const lastLine = Math.max(rightLineCount - 1, 0);

  // Does `line` (relative to the reviewed text) belong to a span of `count` lines starting at `start`?
  // An empty span (insertion on the left, deletion on the right) matches the line it sits before and the one above.
  const inSpan = (line, start, count) => (count > 0 ? line >= start && line < start + count : line === start || line === start - 1);

  return {
    states: () => [...state],
    // Sets block k; false when there is no such block.
    decide(k, accept) {
      if (!(k >= 0 && k < state.length)) return false;
      state[k] = accept ? 'accepted' : 'rejected';
      return true;
    },
    // Decides every block still pending; returns how many it decided.
    decideRest(accept) {
      let n = 0;
      state.forEach((s, k) => {
        if (s === 'pending') {
          state[k] = accept ? 'accepted' : 'rejected';
          n += 1;
        }
      });
      return n;
    },
    isComplete: () => !state.includes('pending'),
    // One boolean per block for blocks.decision; null while a block is still pending.
    accepted() {
      return state.includes('pending') ? null : state.map((s) => s === 'accepted');
    },
    // The block under a cursor line of the document, side 'right' (proposed) or 'left' (original); -1 if none.
    blockAtLine(side, docLine) {
      const rel = docLine - lineOffset;
      return list.findIndex((b) => (side === 'left' ? inSpan(rel, b.oldStart, b.oldCount) : inSpan(rel, b.newStart, b.newCount)));
    },
    // The lines of block k in the proposed document, clamped to it (a deletion is shown on one line).
    lineRange(k) {
      const b = list[k];
      const start = Math.min(lineOffset + b.newStart, lastLine);
      return { start, end: Math.min(lineOffset + b.newStart + Math.max(b.newCount - 1, 0), lastLine) };
    },
  };
}

module.exports = { MAX_THREAD_BLOCKS, shouldShowThreads, createBlockState };
