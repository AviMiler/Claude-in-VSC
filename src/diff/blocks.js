// Pure line diff for per-block approval (package F): splits a change into blocks (hunks) and rebuilds
// the text from the blocks the user kept. No vscode here, so it is unit-tested directly.

const MAX_CELLS = 4000000; // LCS table limit; a bigger middle becomes one block (still correct)

function splitLines(text) {
  return String(text || '').split('\n');
}

// Blocks between `before` and `after`. Each block: {oldStart, oldCount, newStart, newCount, newLines}
// with 0-based line indexes into the split texts; consecutive changed lines form one block.
function diffBlocks(before, after) {
  const a = splitLines(before);
  const b = splitLines(after);
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre += 1;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf += 1;
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  if (!am.length && !bm.length) return [];
  if (am.length * bm.length > MAX_CELLS || !am.length || !bm.length) {
    return [{ oldStart: pre, oldCount: am.length, newStart: pre, newCount: bm.length, newLines: bm }];
  }
  // LCS lengths from the end, then walk forward collecting runs of differing lines.
  const n = am.length;
  const m = bm.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = am[i] === bm[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const blocks = [];
  let open = null;
  const close = () => {
    if (open) blocks.push(open);
    open = null;
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && am[i] === bm[j]) {
      close();
      i += 1;
      j += 1;
      continue;
    }
    if (!open) open = { oldStart: pre + i, oldCount: 0, newStart: pre + j, newCount: 0, newLines: [] };
    if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      open.newLines.push(bm[j]);
      open.newCount += 1;
      j += 1;
    } else {
      open.oldCount += 1;
      i += 1;
    }
  }
  close();
  return blocks;
}

// The text with only the accepted blocks applied. `accepted[k]` true keeps block k.
function applyBlocks(before, blocks, accepted) {
  const a = splitLines(before);
  const out = [];
  let pos = 0;
  blocks.forEach((blk, k) => {
    out.push(...a.slice(pos, blk.oldStart));
    if (accepted[k]) out.push(...blk.newLines);
    else out.push(...a.slice(blk.oldStart, blk.oldStart + blk.oldCount));
    pos = blk.oldStart + blk.oldCount;
  });
  out.push(...a.slice(pos));
  return out.join('\n');
}

// What a review of an Edit or Write call compares. `fileText` is the file on disk ('' when new).
// Returns {before, after, fullBefore, fullAfter, lineOffset} or null when the call cannot be reviewed
// by block (another tool, replace_all, or old_string not found once in the file).
function reviewTexts(tool, input, fileText) {
  const disk = String(fileText || '');
  if (tool === 'Write' && typeof input.content === 'string') {
    return { before: disk, after: input.content, fullBefore: disk, fullAfter: input.content, lineOffset: 0 };
  }
  if (tool === 'Edit' && typeof input.old_string === 'string' && typeof input.new_string === 'string' && !input.replace_all) {
    const at = disk.indexOf(input.old_string);
    if (at < 0 || !input.old_string || disk.indexOf(input.old_string, at + 1) >= 0) return null;
    return {
      before: input.old_string,
      after: input.new_string,
      fullBefore: disk,
      fullAfter: disk.slice(0, at) + input.new_string + disk.slice(at + input.old_string.length),
      lineOffset: disk.slice(0, at).split('\n').length - 1,
    };
  }
  return null;
}

// The decision to send back to the CLI: all kept -> the original input; none -> deny; some ->
// the input with the kept blocks only (`updatedInput`).
function decision(tool, input, texts, blocks, accepted) {
  const kept = accepted.filter(Boolean).length;
  if (kept === 0) return { behavior: 'deny', message: 'המשתמש דחה את כל הבלוקים של השינוי.' };
  if (kept === blocks.length) return { behavior: 'allow', updatedInput: input };
  const merged = applyBlocks(texts.before, blocks, accepted);
  const updatedInput = tool === 'Write' ? { ...input, content: merged } : { ...input, new_string: merged };
  return { behavior: 'allow', updatedInput, partial: { kept, total: blocks.length } };
}

module.exports = { diffBlocks, applyBlocks, reviewTexts, decision };
