\# Plan: build Claude Code Local (VS Code extension) from its spec



\## Context

`claude-vscode/spec.md` (commit f1bdf90) specifies a VS Code extension that copies the official Claude Code extension's structure:

\- Hebrew RTL UI.

\- Offline machine.

\- Zero npm dependencies; plain CommonJS with no build step.



No code exists yet. This plan builds it in the spec's four milestones, M1–M4.

\*\*The spec's content is not changed.\*\* spec.md, DECISIONS.md and the other docs stay as they are. If building shows the spec is wrong or incomplete, stop and ask the user before editing it.



Repo: `C:\\Users\\user\\OneDrive\\מסמכים\\AI projects\\Work\\Software\\Ai\\claude-vscode\\` (branch `main`, no remote).

Each milestone goes through the enforcing-coding-workflow stages:

1\. Validate against spec.md.

2\. Build.

3\. Verify.

4\. Document: only CHANGELOG.md and AGENT\_CONTEXT.md.

5\. Git: one commit per milestone, no push.



\## M1 — manifest, CLI process, chat webview, opening \& placement

1\. \*\*`package.json`\*\*

&#x20;  - The full `contributes` exactly as in the spec tables: viewsContainers, views, all `claude-local.\*` commands, keybindings with `when`, menus, the 24 `claudeLocal.\*` settings, and the walkthrough stub.

&#x20;  - `activationEvents`, `engines ^1.94.0`, `untrustedWorkspaces: false`.

2\. \*\*`extension.js`\*\*

&#x20;  - `activate` builds the shared services (logger, settings, panel registry) and calls each feature's `register(context, services)`.

&#x20;  - `deactivate` disposes them.

3\. \*\*`src/util/`\*\*

&#x20;  - `logger.js`: OutputChannel "Claude Code Local".

&#x20;  - `settings.js`: reads `claudeLocal.\*` and listens to `onDidChangeConfiguration`.

&#x20;  - `nonce.js`, `paths.js`.

4\. \*\*`src/cli/`\*\* (design reference: claude-gui `lib/cli-args.js`, `lib/cli-process.js`, `lib/spawn-utils.js`; the code is written fresh)

&#x20;  - `capabilities.js`: `--version` and `--help`, cached per path.

&#x20;  - `args.js`: the flag list from the spec.

&#x20;  - `spawn.js`:

&#x20;    - `.cmd` files run through `cmd.exe`.

&#x20;    - `claudeProcessWrapper`.

&#x20;    - The env from `environmentVariables` plus `CLAUDE\_CODE\_ENTRYPOINT`.

&#x20;  - `process.js`:

&#x20;    - Newline-delimited JSON.

&#x20;    - `send`, `request(subtype, payload, timeout)`, `respond`, `respondError`, `interrupt`, `kill` (`taskkill /T /F`).

&#x20;    - Routes `control\_request` / `control\_response`.

5\. \*\*`src/panels/`\*\*

&#x20;  - `webview-html.js`: CSP, nonce, `localResourceRoots`.

&#x20;  - `message-router.js`: the postMessage table.

&#x20;  - `event-translator.js`: stream events → UI events.

&#x20;  - `chat-panel.js`: a WebviewPanel `claudeLocalPanel` with its own process.

&#x20;  - `sidebar-view.js`: both sidebar views.

&#x20;  - `panel-registry.js`: last active, closed-session stack, context keys.

&#x20;  - `commands.js`: open, focus/blur, newConversation, reopen, focusLastMessage, toggleFocusView, rename, unread, group, showLogs.

&#x20;  - `status-bar.js`.

&#x20;  - `serializer.js`: reload restore and `continueAfterReload`.

6\. \*\*`webview/chat/`\*\*

&#x20;  - Files: `index.html`, `app.js`, `thread.js`, `composer.js`, `cards.js`, `chat.css`, `onboarding.js`.

&#x20;  - Contents:

&#x20;    - RTL layout and theme variables.

&#x20;    - Streaming.

&#x20;    - Tool rows.

&#x20;    - Permission, question and plan cards.

&#x20;    - Mode and model pickers, thinking switch.

&#x20;    - `/` menu.

&#x20;    - Image paste.

&#x20;    - Stop button.

7\. \*\*`dev/fake-claude.js` + `.cmd`\*\*: answers `initialize`, streams text, sends `can\_use\_tool`, honours `interrupt`.

8\. \*\*`test/`\*\*: `args.test.js`, `process.test.js` (runs the fake CLI over a pipe).



\## M2 — editor context and in-process MCP tools

\- `src/context/`:

&#x20; - `editor-context.js`: open file and selection, debounced 150 ms, pushes `context`.

&#x20; - `exclusions.js`: `files.exclude`, `search.exclude`, `.gitignore`.

&#x20; - `mentions.js`: `findFiles` fuzzy top 20, `@terminal:` via shell integration.

&#x20; - `autosave.js`: saves before Read/Edit/Write.

\- `insertAtMention` / `insertAtMentioned` commands; `webview/chat/mention-menu.js`.

\- `src/mcp/sdk-server.js` + `tools.js`: `getDiagnostics` and `getOpenEditors`, answered over `mcp\_message`.

\- \*\*First:\*\* capture the real CLI's `initialize` and `mcp\_message` shape from its debug log, and resolve the spec's "Not verified" bullet. If the shape differs from the spec, ask the user.

\- Tests: `exclusions.test.js`, mention-range formatting.



\## M3 — native diff review

\- `src/diff/`:

&#x20; - `myers.js`.

&#x20; - `proposed-content.js`: Write / Edit / `replace\_all` / MultiEdit; returns null when `old\_string` is missing.

&#x20; - `providers.js`: read-only left provider, writable `FileSystemProvider` on the right.

&#x20; - `diff-session.js`: one per `can\_use\_tool` request; resolves `allow`/`deny` with `updatedInput`; closing the tab counts as reject.

&#x20; - `hunk-comments.js`: CommentController `claude-local-hunks`; turned off above 100 hunks.

&#x20; - `commands.js`: the six accept/reject commands, plus the context key `claude-local.viewingProposedDiff`.

\- Hooked into the permission flow only in `default` mode. The chat shows the "ממתין לסקירה" card.

\- Tests: `myers.test.js`, `proposed-content.test.js`.



\## M4 — sessions, walkthrough, terminal, IDE WebSocket

\- `src/sessions/`:

&#x20; - `transcripts.js`: encoded cwd, first 64 KB, title / summary / mtime.

&#x20; - `session-store.js`: `globalState` / `workspaceState`.

&#x20; - `sessions-view.js` + `webview/sessions/`: search, time sections, groups, filters, archive.

&#x20; - `archive.js`: `archiveInactiveSessions`, at activation and every 6 h.

&#x20; - `presence.js`: window heartbeat.

\- Walkthrough: `resources/walkthrough/step1-4.md`, the Hebrew onboarding checklist.

\- `src/terminal/terminal-mode.js`: `useTerminal`, the `terminal.open(.keyboard)` swap, `CLAUDE\_CODE\_SSE\_PORT`.

\- `src/mcp/`:

&#x20; - `ws-frames.js`: RFC 6455 codec.

&#x20; - `ws-server.js`: 127.0.0.1, random port, auth header.

&#x20; - `lock-file.js`.

&#x20; - Tools: `openFile`, `openDiff` (reuses M3), `selection\_changed`.

&#x20; - Capture the real protocol first.

\- `scripts/package.ps1`: zips the `.vsix`.

\- Tests: `transcripts.test.js`, `ws-frames.test.js`.



\## Verification

\- \*\*Every milestone:\*\*

&#x20; - `node --test test/`, run from PowerShell (node is not on the Bash PATH).

&#x20; - `node --check` on every `.js` file.

&#x20; - A JSON check of `package.json`.

&#x20; - An id-coverage grep of `package.json` against the spec tables.

\- \*\*On a machine with VS Code:\*\*

&#x20; - `code --extensionDevelopmentPath=<repo>`, first with `claudeLocal.claudePath` set to `dev/fake-claude.cmd`, then with the real CLI and the Ollama server.

&#x20; - Walk the milestone's checklist:

&#x20;   - \*\*M1:\*\* open a tab, sidebar and status bar; Ctrl+Esc and Ctrl+Shift+Esc; a reply streams; a permission card; stop; reload restores the tab.

&#x20;   - \*\*M2:\*\* selection footer; Alt+K; `@` search; Claude calls `getDiagnostics`.

&#x20;   - \*\*M3:\*\* an Edit opens the diff; accept and reject per hunk and for the whole file; an edited right side reaches Claude.

&#x20;   - \*\*M4:\*\* the sessions list resumes a session; archive; terminal mode with `/ide` connects.

&#x20; - VS Code is not installed here, so these manual checks are reported as not done until they run there.

\- \*\*Final step:\*\* `scripts/package.ps1` → install the `.vsix` with "Install from VSIX…".

