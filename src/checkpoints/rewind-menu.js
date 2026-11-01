// The checkpoints menu (Esc Esc or the "rewind" shortcut): pick a prompt of this session, then
// "rewind code" (rewind_files: a dry run first, then confirm) or "fork" (continue in a new
// session with the same context). Rewinding the conversation itself to a point was never
// captured from the CLI (DEPENDENCIES.md), so "conversation" / "both" are not offered.
const vscode = require('vscode');
const { filesChangedCount } = require('./checkpoints');

const ACTIONS = [
  { id: 'code', label: '$(discard) שחזור הקוד לנקודה הזו', detail: 'מחזיר את הקבצים שClaude שינה מאז ההודעה הזו. השיחה עצמה נשארת.' },
  { id: 'fork', label: '$(repo-forked) פיצול השיחה', detail: 'ממשיכים בשיחה חדשה עם אותו הקשר; השיחה המקורית נשמרת כמו שהיא.' },
];

function timeLabel(at) {
  return new Date(at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

async function pickCheckpoint(list) {
  const items = [...list.items].reverse().map((cp) => ({ label: cp.preview || '(הודעה ללא טקסט)', description: timeLabel(cp.at), cp }));
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'לאיזו הודעה לחזור?' });
  return pick && pick.cp;
}

// conv: the Conversation (proc, checkpoints, fork(), post()).
async function runRewindMenu(conv) {
  if (!conv.checkpoints.items.length) {
    return conv.post({ type: 'notice', text: 'אין עדיין נקודות שחזור בשיחה הזו (הן נוצרות עם כל הודעה ששולחים).' });
  }
  if (conv.busy) return conv.post({ type: 'notice', text: 'לא ניתן לשחזר בזמן ש-Claude עובד. עצרו או חכו לסיום.' });
  const cp = await pickCheckpoint(conv.checkpoints);
  if (!cp) return undefined;
  const action = await vscode.window.showQuickPick(ACTIONS, { placeHolder: cp.preview });
  if (!action) return undefined;
  if (action.id === 'fork') return conv.forkSession();
  return rewindCode(conv, cp);
}

async function rewindCode(conv, cp) {
  if (!conv.proc) return conv.post({ type: 'notice', text: 'התהליך של Claude לא פעיל; שלחו הודעה ונסו שוב.' });
  const proc = conv.proc;
  try {
    const dry = await proc.request('rewind_files', { user_message_id: cp.id, dry_run: true }, 30000);
    const count = filesChangedCount(dry);
    const what = count === null ? 'הקבצים ששונו' : count === 1 ? 'קובץ אחד' : `${count} קבצים`;
    if (count === 0) return conv.post({ type: 'notice', text: 'אין שינויי קבצים לשחזר מאז ההודעה הזו.' });
    const ok = await vscode.window.showWarningMessage(`לשחזר ${what} למצב שלפני "${cp.preview}"?`, { modal: true }, 'שחזור');
    if (ok !== 'שחזור') return undefined;
    if (conv.proc !== proc) return conv.post({ type: 'notice', text: 'התהליך של Claude הופעל מחדש בינתיים; השחזור בוטל.' });
    await proc.request('rewind_files', { user_message_id: cp.id }, 30000);
    return conv.post({ type: 'notice', text: `הקוד שוחזר (${what}).` });
  } catch (err) {
    return conv.notifyFailure('rewind_files', err);
  }
}

module.exports = { runRewindMenu };
