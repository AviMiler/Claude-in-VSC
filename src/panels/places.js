// The one placement rule: Claude opens in the place `claudeLocal.preferredLocation` names (the
// sidebar by default, or one editor tab). Every entry point (editor-title button, status bar,
// shortcuts, history, URI links) goes through `main()`; a conversation that is already open is
// focused where it is instead of opening twice.
const { openChatPanel } = require('./chat-panel');

function createPlaces(services, sidebarHost) {
  let editorHost = null;
  let lastHost = null;

  const preferred = () => (services.settings.get().preferredLocation === 'panel' ? 'editor' : 'sidebar');
  const use = (host) => { lastHost = host; return host; };

  return {
    // Shows the preferred place (creating the editor tab if needed) and returns its host.
    async main() {
      if (preferred() === 'sidebar') {
        await sidebarHost.revealPlace();
        return use(sidebarHost);
      }
      if (editorHost) {
        editorHost.revealPlace();
        return use(editorHost);
      }
      services.logger.info('session', 'open the editor tab place');
      editorHost = openChatPanel(services);
      return use(editorHost);
    },
    // The host the user works in now: the focused one, else the last one used, else the preferred one.
    active() {
      const hosts = [sidebarHost, editorHost].filter(Boolean);
      return hosts.find((h) => h.focused) || (lastHost && hosts.includes(lastHost) ? lastHost : null)
        || (preferred() === 'editor' ? editorHost : sidebarHost);
    },
    isFocused: () => Boolean(sidebarHost.focused || (editorHost && editorHost.focused)),
    use,
    editorClosed(host) {
      if (editorHost === host) editorHost = null;
      if (lastHost === host) lastHost = null;
    },
  };
}

module.exports = { createPlaces };
