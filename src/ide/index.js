// The IDE server feature (PLAN.md section 7): started when `claudeLocal.ideServer` is on (off by default since package K),
// stopped and its lock file removed when the setting is turned off or the extension deactivates.
// Exposes `services.ide` = { envFor(cwd), watchConnection(onMissing) } for src/panels/conversation.js.
const vscode = require('vscode');
const { createIdeService } = require('./ide-service');
const { createVscodeIdeDeps, editorSelection, workspaceFolderPaths } = require('./ide-vscode');
const { lockDir } = require('./ide-lock');

const TAG = 'ide';
const SELECTION_PAUSE_MS = 100;

function register(context, services) {
  const { logger, settings, editorTracker } = services;
  const log = (text, level = 'info') => logger[level](TAG, text);
  let svc = null;
  let starting = null;

  async function start() {
    svc = createIdeService({
      deps: createVscodeIdeDeps(),
      workspaceFolders: workspaceFolderPaths,
      ideName: vscode.env.appName,
      dir: lockDir(process.env),
      log,
      verbose: () => settings.get().ideServerVerboseLog, // read live: no restart, connected CLIs stay
    });
    try {
      await svc.start();
    } catch (err) {
      log(`failed to start: ${err && err.message}`, 'warn');
      svc = null;
    }
  }
  async function stop() {
    const old = svc;
    svc = null;
    if (old) await old.stop();
  }
  const sync = () => {
    starting = (starting || Promise.resolve()).then(async () => {
      const on = settings.get().ideServer;
      if (on && !svc) await start();
      else if (!on && svc) await stop();
    });
  };

  let timer = null;
  const trackerSub = editorTracker.onDidChange(() => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (svc && svc.openClients) svc.notifySelection(editorSelection(editorTracker.editor())); }, SELECTION_PAUSE_MS);
  });
  const settingsSub = settings.onDidChange(sync);

  services.ide = {
    envFor: (cwd) => (svc ? svc.envFor(cwd) : {}),
    watchConnection: (onMissing) => (svc && svc.port ? svc.watchConnection(onMissing) : () => {}),
  };
  sync();

  context.subscriptions.push({
    dispose() {
      clearTimeout(timer);
      trackerSub.dispose();
      settingsSub.dispose();
      if (svc) svc.stop(); // removes the lock synchronously before the async close
    },
  });
}

module.exports = { register };
