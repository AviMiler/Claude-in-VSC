// The side conversation of the /btw panel (pure: no vscode import, unit-testable). The CLI keeps no
// session for it: every question is a separate one-shot process (src/cli/btw.js) and a follow-up
// carries the earlier turns of THIS side conversation in its stdin text (buildBtwPrompt). The
// history lives in memory only and dies with the panel; nothing is persisted.
const { runBtw, buildBtwPrompt } = require('../cli/btw');
const { isWrapper } = require('./error-card');

const WRAPPER_NOTE = 'claudePath מצביע על קובץ עטיפה (.cmd/.bat) ששואלת "Select model number" ונתקעת. הצביעו על claude-bin.exe.';

class BtwSession {
  // `run` is injectable for tests; `post(msg)` sends a message to the webview.
  constructor({ run = runBtw, post, logger } = {}) {
    this.run = run;
    this.post = post || (() => {});
    this.logger = logger;
    this.runOptions = {};
    this.history = []; // [{ q, a }] completed turns only
    this.job = null; // { id, cancel } of the question in flight
  }

  // { claudePath, env, model, settings }: refreshed on every open from the current settings.
  setRunOptions(opts) {
    this.runOptions = opts || {};
  }

  get busy() {
    return Boolean(this.job);
  }

  ask(id, text) {
    const question = String(text || '').trim();
    if (!id || !question) return;
    if (this.job) {
      this.post({ type: 'answer', id, error: 'שאלה קודמת עדיין בעיבוד. המתינו לתשובה או עצרו אותה.' });
      return;
    }
    const { claudePath, env } = this.runOptions;
    if (this.logger) this.logger.info('btw', `ask (${question.length} chars, ${this.history.length} earlier turns)`);
    const job = this.run({ ...this.runOptions, question: buildBtwPrompt(this.history, question) });
    const entry = { id, cancel: () => job.cancel() };
    this.job = entry;
    job.promise.then((r) => {
      if (this.job !== entry) return; // cleared or disposed while in flight: the answer is dropped
      this.job = null;
      if (r.error) {
        // Same wrapper warning as the main connection's error card; a failed turn is not kept.
        const wrapper = isWrapper(claudePath, env || {});
        this.post({ type: 'answer', id, error: wrapper ? `${r.error} ${WRAPPER_NOTE}` : r.error });
        return;
      }
      this.history.push({ q: question, a: r.text });
      this.post({ type: 'answer', id, text: r.text });
    });
  }

  cancel(id) {
    if (this.job && this.job.id === id) {
      const job = this.job;
      this.job = null; // the late result is ignored (see ask)
      job.cancel();
      this.post({ type: 'answer', id, error: 'השאלה בוטלה.' });
    }
  }

  clear() {
    if (this.job) {
      const job = this.job;
      this.job = null;
      job.cancel();
    }
    this.history = [];
  }

  dispose() {
    this.clear();
    this.post = () => {};
  }
}

module.exports = { BtwSession, WRAPPER_NOTE };
