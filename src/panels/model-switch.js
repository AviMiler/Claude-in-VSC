// Model picker and model switching for one conversation (PLAN.md section 3, decisions 1, 4, 6).
// A switch restarts the CLI with `--model <id>`, every model alias pointed at <id> through
// `--settings` (src/models/launch.js) and `--resume <session>`. The run-time `set_model` request is not used: the CLI accepts any name and
// only the next turn fails (DEPENDENCIES.md section 2 #26).
const vscode = require('vscode');
const { resolveGatewayUrl, fetchModels } = require('../models/gateway');
const { filterModels, isNoToolsError } = require('../models/filter');
const { DEFAULT_MODEL } = require('../models/launch');

const STOP_AND_SWITCH = 'עצירה והחלפה';
const STOP_AND_SWITCH_DETAIL = [
  'החלפת מודל מפעילה מחדש את Claude Code וממשיכה את אותה שיחה. כיוון ש-Claude עובד עכשיו, התור הנוכחי ייעצר קודם:',
  '• התשובה החלקית שנכתבה עד עכשיו לא תושלם.',
  '• כלי שרץ כרגע ייקטע באמצע – קובץ עלול להישאר כתוב רק בחלקו.',
  '• בקשת הרשאה שממתינה לתשובה תידחה.',
  'ההודעות שכבר הסתיימו נשמרות בשיחה.',
].join('\n');

class ModelSwitcher {
  constructor(conversation) {
    this.conv = conversation;
    this.list = null; // filtered gateway ids; null until the first fetch
    this.previous = null; // the model to return to if the new one fails with "does not support tools"
    this.pendingSwitch = null; // a model chosen with "stop and switch", applied when the turn ends
  }

  // The list is fetched once per conversation (in memory); if the gateway is unavailable the picker
  // shows only the current model, nothing changes, and the next process start tries again.
  async postList() {
    const conv = this.conv;
    if (!this.list) {
      const s = conv.services.settings.get();
      try {
        const { ids, info } = await fetchModels(resolveGatewayUrl(s));
        this.list = filterModels(ids, info, s.modelDenylist);
      } catch (err) {
        conv.services.logger.warn('model-switch', `model list failed: ${err.message}`);
      }
    }
    const values = [DEFAULT_MODEL, ...(this.list || [])];
    if (!values.includes(conv.model)) values.push(conv.model);
    const models = values.map((value) => ({
      value,
      displayName: value === DEFAULT_MODEL ? 'ברירת מחדל' : value,
      description: value === DEFAULT_MODEL ? 'המודל שמוגדר ב-Claude Code' : undefined,
    }));
    conv.post({ type: 'models', models, current: conv.model });
  }

  switchTo(value, { revert = false } = {}) {
    const conv = this.conv;
    if (!value || value === conv.model) return conv.post({ type: 'model', value: conv.model });
    if (conv.busy) {
      conv.post({ type: 'notice', text: 'לא ניתן להחליף מודל בזמן ש-Claude עובד. השתמשו ב"עצירה והחלפה".' });
      return conv.post({ type: 'model', value: conv.model });
    }
    conv.services.logger.info('model-switch', `${conv.model} -> ${value}${revert ? ' (revert)' : ''}, restart=${Boolean(conv.proc)}`);
    this.previous = revert ? null : conv.model;
    conv.model = value;
    conv.post({ type: 'model', value });
    if (!conv.proc) return; // the next send starts the process with the new model
    conv.killProcess();
    conv.startProcess({ resume: conv.sessionId || undefined });
    if (!revert) conv.post({ type: 'notice', text: `המודל הוחלף ל-${value}. הטעינה הראשונה עשויה להימשך זמן מה.` });
  }

  async stopAndSwitch(value) {
    const conv = this.conv;
    if (!conv.busy) return this.switchTo(value);
    const choice = await vscode.window.showWarningMessage(
      `לעצור את Claude ולעבור ל-${value}?`,
      { modal: true, detail: STOP_AND_SWITCH_DETAIL },
      STOP_AND_SWITCH,
    );
    if (choice !== STOP_AND_SWITCH) return conv.post({ type: 'model', value: conv.model });
    if (!conv.busy) return this.switchTo(value);
    conv.services.logger.info('model-switch', `stop-and-switch to ${value}: interrupting`);
    this.pendingSwitch = value;
    conv.interrupt();
  }

  // Called with every turn result (also a locally closed stopped turn and a process exit).
  onTurnEnd(ev) {
    const conv = this.conv;
    if (this.pendingSwitch) {
      const value = this.pendingSwitch;
      this.pendingSwitch = null;
      setImmediate(() => this.switchTo(value));
      return;
    }
    if (ev.isError && isNoToolsError(ev.errorText) && this.previous !== null) {
      const failed = conv.model;
      const back = this.previous;
      conv.post({ type: 'notice', text: `המודל ${failed} לא תומך בכלים ולכן לא יכול לעבוד עם Claude Code. חוזרים ל-${back === DEFAULT_MODEL ? 'מודל ברירת המחדל' : back}.` });
      setImmediate(() => this.switchTo(back, { revert: true }));
      return;
    }
    if (ev.kind === 'result' && !ev.isError) this.previous = null;
  }
}

module.exports = { ModelSwitcher, STOP_AND_SWITCH_DETAIL };
