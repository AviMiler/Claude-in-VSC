# Fix list

Problems found by the user while running the manual tests (`dev/manual-tests.html`), first run on 2026-11-02 (VS Code 1.91.1, real CLI 2.1.246, models `qwen3.8:27b`, `qwen2.5:7b`, `qwen3:latest`). Each item: what was reported, what is known, status. When an item is fixed, move it to `CHANGELOG.md` and delete it here. Priorities: **P1** blocks normal use or is a wrong behaviour, **P2** missing or confusing, **P3** polish.

## Test run 2026-11-02: summary
PASS with no complaint: 1.1, 1.2, 3.1, 4.1-4.3, 5.1, 5.2, 6.1, 7.2, 9.1, 10.1, 12.2, 13.1, 13.3, 15.1, 20.1, 21.1, 23.1. **FAIL: 2.2, 7.1, 11.1, 12.3.** PASS with a complaint: 8.1, 13.2, 14.1, 16.1, 17.1, 18.1, 19.1, 24.1. Not run: 1.3, 2.3 (the log shows it worked), 2.4, 22.1, 24.2. 24.3 was run in the CLI terminal, not in the extension, so the `/loop` indicator is still unverified.

## Order of work (decided by the user, 2026-11-02)
1. **Fix 1: the basic interface** = F-1 (where every conversation opens, one clear entry point), F-2 (new conversation while one runs) and F-3 (visual design and responsiveness). Nothing else starts before this is agreed and done, because the other fixes touch the same panels. Needs a short design decision with the user first (one rule for placement, which buttons remain), then screenshots from the user for the design pass.
2. F-4 `@` mentions, F-5 `/plan`, F-6 Ctrl+Shift+T and tab dots, F-7 shortcuts.
3. F-8 model switch loads two models, F-9 context meter 1,000,000, F-10 meter click.
4. F-11 images, F-12 rewind button, F-13 `/` menu, F-14 always-allow, F-15 URI docs, F-16 test page.
5. F-17 minor items.
Nothing here is implemented yet. Fixes run in the usual workflow, one model per task as `AGENT_CONTEXT.md` requires.

## P1

### F-1 Conversation placement is confusing (reported 2026-11-02, also 12.1)
- **Symptom:** several entry points open a conversation, and each time it can open in a different, unpredictable place (editor tab, other editor group, sidebar). "3 different buttons".
- **Known (from `package.json`):** `claude-local.editor.open` ("פתיחה בלשונית חדשה", Ctrl+Shift+Esc and Ctrl+Alt+C), `claude-local.editor.openLast` ("פתיחת Claude", editor title button), `claude-local.sidebar.open`, `claude-local.newConversation`, `claude-local.history.open`, `claude-local.continueLast`, `claude-local.reopenClosed`; placement also depends on `preferredLocation` and `lockEditorGroups`.
- **To decide with the user before coding:** one predictable rule for where a conversation opens, and whether to merge the open buttons into one.
- **Status:** open, not investigated.

### F-2 A new conversation does not open while another is running (reported 2026-11-02)
- **Symptom:** "שיחה חדשה" does nothing while a conversation is running. Not reproduced yet; candidates: the command is ignored while a turn is active, or it reuses the running panel.
- **Expected:** a new conversation opens in its own panel without interrupting the running one.
- **Status:** open. Needs a test and a `[session]` log line for the refused case.

### F-4 `@` mentions do not work (test 7.1, FAIL)
- **Symptom:** the model says the file is not found when a file is picked from the list; the model invents a wrong path (`C:\dev\gateway-probe\extension.js`); folders cannot be entered in the `@` list; sometimes a file does attach.
- **Known:** the extension sends `@path` as plain text; whether the CLI expands `@path` in stream-json mode was unverified and the result suggests it does not. The `@` list is flat.
- **Fix idea:** resolve the picked path to an absolute path (or read the file and attach it) before sending; allow navigating into folders in the list. Test with the real CLI.
- **Status:** open.

### F-5 `/plan` shows nothing (test 11.1, FAIL)
- **Symptom:** `/plan` and `/plan open` show nothing. Known: `/plan` only switches to plan mode; the "open plan" document needs assistant text before `ExitPlanMode`, and the local model may not call it.
- **Status:** open; needs a visible result (at least a mode indicator and a message when there is no plan yet).

### F-6 Ctrl+Shift+T and tab colour dots do not work (test 12.3, FAIL)
- **Status:** open, no details given. Ask the user what exactly happened (which tab, what was expected). Check `claude-local:hasClosed` context key and the `when` clause in `package.json`.

### F-7 Ctrl+Esc (test 2.2, FAIL) and other shortcuts (test 2.1)
- **Symptom:** Ctrl+Esc does not work as the editor/chat toggle; the tester reported "VS Code does not block it" (most likely Windows takes it for the Start menu). Of the open shortcuts only Ctrl+Alt+C works; Ctrl+Shift+Esc does not (Windows Task Manager).
- **Fix:** replace Ctrl+Esc with another default (SETUP.md suggests Ctrl+Alt+E) and Ctrl+Shift+Esc with another default; confirm with the user which keys they want.
- **Status:** open.

### F-8 Model switch loads two models (log of tests 4.3, 5.1, 13.1)
- **Evidence:** after switching to `qwen2.5:7b` the log still shows `[claude-code:unrecognized_model] {"model":"qwen3.8:27b","query_source":"generate_session_title"}` next to `{"model":"qwen2.5:7b","query_source":"sdk"}`: the title call still uses `qwen3.8:27b`, so the server loads a second model (cold load 285 s). Package D sets the three `ANTHROPIC_DEFAULT_*_MODEL` variables, but they apparently lose against `env` in the CLI's `settings.json`.
- **Fix idea:** pass `--settings` with an override or a different mechanism; verify with `/api/ps` that only one model is loaded.
- **Status:** open.

### F-9 Context meter shows 1,000,000 until the model is switched (test 1.2 log)
- **Evidence:** `used=3575 max=1000000` on the default model (model name arrives as `qwen3.8:27b[1m]`), `max=64000` after an explicit switch. `CLAUDE_CODE_MAX_CONTEXT_TOKENS=64000` is passed but not effective for the default model.
- **Status:** open.

## P2

### F-10 Context meter click compacts (test 13.2)
The user: clicking the meter runs `/compact`, which makes no sense; remove it (the meter should only display; compact stays as `/compact`).

### F-11 Images and drag (test 8.1)
Paste works; **drag does not work**; an image cannot be sent without text; models without vision return a server error (shown raw). Fix: allow image-only send, fix drag, show a clear Hebrew message on that server error.

### F-12 Rewind needs a button (test 17.1)
Esc Esc works for code rewind and fork, but the user wants a visible button too, not only the shortcut.

### F-13 Extension-local commands missing in the `/` menu (test 18.1)
`/diff`, `/plan` and the like should appear when typing `/`, with a note that they are local to the extension.

### F-14 "Always allow in this project" is ignored (log of test 5.1)
`stderr: Ignoring 1 permissions.allow entry from .claude/settings.local.json: this workspace has not been trusted` — the choice "אושר תמיד בפרויקט הזה" writes a rule the CLI then ignores in an untrusted workspace, so the user is asked again. Fix: explain it in the card, or write the rule where the CLI honours it.

### F-15 URI `session=<id>` is unclear (test 16.1)
Document what `session` does (opens that past conversation by id) in the test page and `SETUP.md`.

### F-16 Test page / `/loop` indicator
Test 24.1 did not create a loop (`/loop` was sent without a prompt, so the model asked a question); 24.3 was run in the CLI terminal. Fix the steps to use `/loop 1m Reply with the single word PING` inside the extension chat. Test 22.1 (screen reader): the user does not need it; mark it optional.

## P3

### F-3 Visual design needs polish (reported 2026-11-02; 1.1, 14.1, 19.1) — part of Fix 1
Responsiveness problems; the MCP dialog "slightly bad design"; the background-task box and its stop button are "ugly". Needs screenshots or a pass in the browser preview (`.claude/launch.json`, "chat-preview"): RTL spacing, composer, tool rows, cards, history list, tasks / background / `/loop` bars, dark and light themes, narrow widths.

### F-17 Minor
- `[agents] card … started (subagent=?` — the sub-agent type is not logged.
- `initialize failed: process exited` appeared once (test 2.1, 23:10:43); the next start worked. Check whether it was the shortcut test (two processes) or a real race.
- Models like `qwen2.5:7b` print tool calls as JSON text and answer in Chinese or mixed language: a model limit, not an extension bug.
