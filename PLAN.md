# Plan: every decision and its reason

Updated: 2026-11-09. This is the **single source of truth for what to build next**. `DECISIONS.md` holds architecture-level decisions with alternatives and reasons; what exists today is `spec.md`; the measured facts behind the decisions are `DEPENDENCIES.md`.

**Source of each decision:** 👤 the user decided · ✅ a recommendation the user approved · 🔧 derived from a check against the CLI/gateway (a factual reason) · ⚠️ my adjustment not asked explicitly (awaiting approval).

## 1. Base facts that affect everything

| Fact | Value | Source |
|---|---|---|
| Environment | A machine that will end up without internet; local model `qwen3.8:27b` through the LiteLLM 1.80.0 gateway (`172.27.5.5:11436`) over Ollama (`:11435`) | `SETUP.md`, checks |
| The CLI | Claude Code 2.1.246 (`claude-bin.exe`) | checks |
| VS Code | 1.91.1 (no secondary side bar; every API must fit) | checks |
| Internet | **None on the user's machine.** A few files can be brought in; nothing is installed from the network; code libraries only in special cases with no other way (rule in `AGENT_CONTEXT.md`) | 👤 2026-11-05 |
| Principles | The extension stores no data; the CLI is the source of truth; plain JS with no build and no npm; every user-facing string in Hebrew | `spec.md` |
| Real context window | **64,000**: measured for `gemma4:26b` (`/api/ps`); for `qwen3.8:27b` at least 50,000 measured (no plateau) and `/api/ps` 64,000 seen on the work machine 2026-11-08 (CHANGELOG); it is NOT the same for all models (`qwen2.5-coder:7b` has 32,768, `DEPENDENCIES.md` row 44), so since 2026-11-24 it is read per model from `/api/ps` (64,000 is only the fallback; `DECISIONS.md` 2026-11-24). The gateway setting (12,288) and its `max_input_tokens` are not enforced. Claude Code itself sends about 25,000 tokens for a simple message, so the meter starts at roughly 40% | 🔧 |
| Cold model load | 285 seconds; keep-alive about 5 minutes | 🔧 |

## 2. Decisions by topic

### Stage 1: opening, launching and placement

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Open in Terminal | **Yes** | Runs the CLI's original interface in VS Code's terminal; also a fallback for commands the chat does not support | 👤 |
| Activity Bar icon for a session list | **Yes** (depends on stage 4); later replaced by the drawer in the chat (Fix 1) | A dedicated list of previous conversations instead of a button inside the chat | 👤 |
| Open in New Window | **No** | Low value when working in one window | 👤 |
| Sign-in screen / onboarding checklist | **None.** Instead a Hebrew card in the chat when the CLI fails (check `ANTHROPIC_BASE_URL`, that the server runs, `claudePath`, a button that opens `settings.json`), **plus a warning in the same card when `claudePath` resolves to a `.cmd`/`.bat` wrapper** (it asks "Select model number" and hangs the extension), with a button that opens the setting (decided 2026-11-01) | Local model, no login; the helpful instructions are the connection settings | 👤 |
| Retry after an error | **✅ built 2026-11-05:** a "נסה שוב" button on the error card and on a failed send; re-sends the same request; no automatic retry, text unchanged; shown on every error result (button only, decided with the user) | Requested 2026-11-03 | ✅ |
| URI links | **Yes, with confirmation before sending** (`vscode://local.claude-local/open`, parameters `prompt`, `session`) | The text goes into the box and is not sent automatically, to prevent prompt injection from an external link | 👤 |
| Panel placement | Settings `preferredLocation` (tab/sidebar) and `lockEditorGroups` | The user asked to offer both as settings (then one place, Fix 1: `DECISIONS.md` 2026-11-02) | 👤 |

### Stage 2: the prompt box

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Auto mode | **Yes, with a Hebrew warning in the picker** ("ה-CLI מחליט לבד, המסווג עלול לטעות") | `set_permission_mode auto` was accepted and Write ran without a question; the classifier's behaviour with a local model on dangerous actions was not tested | 👤 + 🔧 |
| `/plan`, `/plan open` | **Yes** (implemented in the extension; not in the CLI's command list) | Plan mode exists; the commands do not appear in `initialize` | 👤 + 🔧 |
| Plan as a document | **Version B:** an "open in editor" button opening a read-only virtual Markdown document (`TextDocumentContentProvider`, no file written). No inline comments | Keeps "no storage"; version C (inline comments) is very heavy (about 250 lines) | 👤 |
| Source of the plan text | The assistant's text messages of the plan-mode turn (not `input.plan`, which arrives empty; `ExitPlanMode` did not arrive on the work machine, 2026-11-09, so the text is the only source) | Observed in the checks | 🔧 |
| Plan approval buttons | **Dropped 2026-11-09** (the user's rule of 2026-11-08: build them only if the CLI sends `ExitPlanMode`; it did not on the work machine) | `DEPENDENCIES.md` row 43: the model wrote the plan as text and asked in text. A replacement is proposed, not decided (`FUTURE_FEATURES.md` 4.3g) | 👤 + 🔧 |
| `/` menu | **Groups + a distinction between skills and built-in commands** | `system/init` has `skills` against `slash_commands` and `terminal_slash_commands` | 👤 + 🔧 |
| @-mentions | **Files and folders only** | `@terminal` depends on a limited VS Code API; `@browser` needs Chrome and is irrelevant offline | 👤 |
| Images and files | **Paste images, drag files (Shift), PDF and LaTeX (LaTeX built 2026-11-05).** **No control by model:** images are always accepted, no `visionModels` setting, no warning, no blocking (decided 2026-11-01) | Vision was verified only on `qwen3.8:27b`; gateway capability flags are unreliable and `/api/show` is not exposed. The earlier requirement to hide/disable images for models without vision is **dropped**; PDF is read by the CLI (needs poppler); LaTeX uses bundled KaTeX | 👤 + 🔧 |
| Attaching files (decided 2026-11-05, discussion session; **items 2-3 superseded 2026-11-08 by the file chip, section 10**) | **(1) `@` behaves exactly like the CLI:** a one-time tag; the file content enters the context once and stays in history; a folder gives a listing only. No visible list of attached files, no removable chips (the CLI has neither). **(2) The working-file button becomes a source button** (explorer, file or folder; instruction before the next message, once, repeated only when the choice changes): file `זה קובץ המקור של השיחה הזו: @path. קרא אותו ותתחיל לעבוד ממנו.`, folder `זו תיקיית המקור של השיחה הזו: @path. עבור על התוכן שלה ותתחיל לעבוד ממנה.` **(3)** One item at a time. **(4)** In memory only: lost on closing the conversation or reloading the window; no change to `DECISIONS.md`. **(5)** Images and PDF unchanged: only the path is sent and the model opens them with its read tool | The CLI has no attached-files list: attachment is a one-time tag kept in history (`--resume` restores it, so the CLI stays the source of truth). Whether the CLI expands `@path` in stream-json: answered 2026-11-08, it does not (CHANGELOG) | 👤 |
| Thinking | **Removed** | No thinking blocks and 0 thinking tokens | 🔧 |
| Effort | **Removed** | `output_config.effort: high` is fixed in the gateway; no difference in the check | 🔧 |
| Ultracode, cache clock | **No** | Anthropic features, irrelevant to a local model | 👤 |
| A copy button on every answer | **Yes** | Simple and useful | 👤 |
| `/btw` panel | **Yes** (a side question, no tools, no history). **Built 2026-11-08**, reworked the same day into a side panel (`webview/btw/`) with follow-ups; each call is a separate one-shot process (`--tools ""`, `--no-session-persistence`); the one-shot flags work on the real CLI 2.1.246 (2026-11-08) | Chosen by the user | 👤 |
| Bookmarks | **No** | They need storage and contradict "no storage" | 👤 |
| Context meter + `/compact` | **Yes**, by `get_context_usage` and `CLAUDE_CODE_MAX_CONTEXT_TOKENS=64000`. No cost (replaced by the usage gauge, section 9) | The CLI assumes 200,000 for an unknown model; the cost it reports is meaningless | 👤 + 🔧 |
| Agent map | **A collapsible card in the chat** per sub-agent call (running / finished; when opened, the tools it ran grouped by `parent_tool_use_id`). No separate panel. Package B starts with a short check against the real CLI that the local model launches sub-agents at all; if not, postpone (decided 2026-11-01) | Sub-agent messages are filtered out today (`event-translator.js`); the data is available. The local model may rarely use sub-agents | 👤 |

### Stage 3: editor context and change review

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Automatic context (selection and open file) | **First try through an IDE server; if it does not work, fall back to chips** above the box (`קובץ: app.ts`, `שורות 5–10`, removable) | The user wanted the official way first; the IDE server had not been tested (`/ide` does not detect, `~/.claude/ide` does not exist). Outcome: the CLI did not connect; the IDE server was removed 2026-11-09; chips are the route (section 10) | 👤 |
| Working-file button (**superseded 2026-11-08: the file chip replaces it, section 10**) | **✅ built 2026-11-05 (file handed to the model once per change):** a button only, showing the file the work is on, by default the open file; a click opens a file picker; shown even with no file open | Requested 2026-11-03; compare Alt+K (a one-off `@path`) and the chips | ✅ |
| Alt+K | **Yes** (inserts `@path#lines`). **Split:** package C inserts `@path` of the open file; package F adds the selected lines (decided 2026-11-01) | Depends on @-mentions (C) and editor context (F) | 👤 |
| Settings `attachSelection`, `attachOpenFile`, `respectGitIgnore` | **Yes**, on by default | Control over the automatic context | 👤 |
| diff on edits | **Approve each change block separately** (CodeLens, returned to the CLI as `updatedInput`) | Verified: the CLI honoured our change (`PROBE_CHANGED` went into the file). Approving everything is not needed | 👤 + 🔧 |
| autosave | **Yes**, on by default | So Claude sees the current file on disk | 👤 |

### Stage 4: sessions, history, checkpoints, background

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Rename a session | **Yes, through the CLI's `/rename`** | Verified: `custom-title` is written to the jsonl | 👤 + 🔧 |
| Filters (active / waiting / finished) | **Yes**, temporary, no storage | Fits "no storage" | 👤 |
| Archiving and session groups | **No** | The CLI does not archive; adding it needs storage. Asked; the user chose "do not archive" | 👤 |
| Reopen (Ctrl+Shift+T), colour dots on tabs | **Yes** (in-memory list; marked through name/icon, no colour API). **Blue = waiting for permission, orange = finished in a hidden tab** | Chosen | 👤 |
| `continueAfterReload` | **As a suggestion only**: "continue the last conversation", read from the transcripts | Contradicts "no restore after refresh", so implemented with no stored state | 👤 + ⚠️ |
| Web tab | **No** | Anthropic cloud infrastructure | 👤 |
| Checkpoints | **Fork and rewind code, Esc Esc. Rewind of the conversation only and "both" dropped by the user 2026-11-08** (the needed CLI message was never captured) | Verified: rewind worked with `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1` and `--replay-user-messages` (the saved setting `checkpoints=true` is not enough); fork works | 👤 + 🔧 |
| Background | **A task map with stop. The "move to background" button dropped by the user 2026-11-08** (the CLI has no request for it) | Verified: `task_started`, `background_tasks_changed`, `stop_task` | 👤 + 🔧 |

### Stage 5: environment integration

| Feature | Decision | Reason | Source |
|---|---|---|---|
| IDE server | **Removed 2026-11-09 (user decision, section 7).** Was: **A local WebSocket server + context + getDiagnostics.** `executeCode` (Jupyter): no. **A feasibility check first (my prototype)** | Need to know whether the CLI connects; if not, the chips fallback | 👤 |
| Code navigation for Claude (decided 2026-11-05; built as package J) | **Tools backed by VS Code's own language features** (already LSP-backed; the extension runs no language server and installs nothing), **delivered through an MCP server of our own** (`--mcp-config`, no lock file). The IDE server is **not** used for navigation. **Scope: JavaScript and React only** (VS Code's built-in TypeScript language service); .NET/C# stays future (`FUTURE_FEATURES.md` section 2). Tools and open checks: section 8 | Claude navigates only by text (`Grep`/`Glob`/`Read`), which costs context in a 64,000 window; symbol-level answers are much smaller. Verified by the user 2026-11-05: JS/React navigation works in VS Code with no extension installed; no C# extension is installed | 👤 |
| MCP | **A full management dialog, including add and remove from the UI** (list + status, enable/disable, reconnect). OAuth: no. **Principle (2026-11-05): the extension is only a bridge to the CLI, for using MCP servers and turning them on or off in a session; no new editing features; the existing add/remove buttons stay.** **Additions (decided 2026-11-05):** (1) each server's tool list in the dialog, read-only; (2) MCP prompts as commands in the grouped `/` menu, if the CLI sends them in stream-json; (3) a check that a per-session on/off is not written to the CLI's configuration (section 6 item 12). MCP resources through `@` not chosen (`FUTURE_FEATURES.md` section 3) | Verified: `mcp_status`, `mcp_reconnect`, `mcp_toggle`, `claude mcp add/remove` work | 👤 + 🔧 |
| Plugins and Mods | **Skip** | Marketplaces on GitHub, does not work offline | 👤 |
| Git | **No change** (through Bash); no PR status | Already works; the status needs GitHub | 👤 |
| Session usage line | **Tokens only, no cost.** A full `/usage` dialog: no. Git status in the box line: no. **Separate from the context meter**: the meter shows the window fill now ("הקשר: 23,400 / 64,000"); the usage line shows the last turn ("תור: קלט · פלט"). **Cost removal done in package D** (decided 2026-11-01) | The cost the CLI reports is meaningless (`costBasis: unknown`), nothing costs money here. The two come from different sources (`get_context_usage` vs the `result` message) | 👤 + 🔧 |

### Stage 6: display, accessibility, settings, shortcuts

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Display | **Focus view, timestamps, `spinnerVerbs`, `scrollToBottomOnSend`** | Chosen; light and independent | 👤 |
| Official look | **Follow the newest official extension (anthropic.claude-code 2.1.319): tokens and component rules from its `webview/index.css`, re-expressed in our own CSS (no file copied)** (details `spec.md` "Chat webview"). The file and lines chips stay above the text | User: "the blue design is not pretty; imitate exactly the newest official extension" (2026-11-09) | ✅ built 2026-11-09 (browser preview only) |
| Dark mode default | **No: follow the VS Code theme like the official extension** (no forced dark, no setting, no code change) | Asked; decided 2026-11-09 | 👤 |
| Collapsing user messages | **Display-only collapse of long user messages**: above a set length the first lines show with a "הצג עוד" / "כווץ" toggle; the text sent to the CLI and the transcript are unchanged; short messages never collapse. Setting `claudeLocal.collapseUserMessageLines`, default 8 | Requested 2026-11-02 on `develop` | ✅ built 2026-11-05 |
| `useTerminal` | **A setting** that makes the main button open a terminal | Chosen | 👤 |
| Accessibility | **Colour settings only** (`prefersReducedMotion`, daltonized). **Screen-reader support (announcements, speaker labels, heading navigation) removed from the plan 2026-11-06: not needed** | The user decided | 👤 |
| More settings | **`enableNewConversationShortcut` (Ctrl+N), `environmentVariables`** | Chosen | 👤 |
| `claudeProcessWrapper`, `usePythonEnvironment`, `enableReopenClosedSessionShortcut`, `disableLoginPrompt` | **No** | Not needed (a wrapper is possible later; no login; Ctrl+Shift+T already decided) | 👤 |
| Shortcuts | **Ctrl+Alt+E** (editor↔chat, replaced Ctrl+Esc) + **Ctrl+Alt+C** to open; Ctrl+Shift+Esc removed (decided 2026-11-05) | Ctrl+Shift+Esc is Windows Task Manager | 👤 |
| Rebindable shortcuts | **All shortcuts** (`contributes.keybindings` plus the command "Claude Code Local: Keyboard Shortcuts" opening `workbench.action.openGlobalKeybindings` filtered to `claude-local`). **Shortcuts inside the webview** (Enter, Shift+Enter, Esc Esc): **settings `claudeLocal.keybindings.*`** (decided 2026-11-01); limitation: the webview does not see VS Code's keybindings, so these are separate from the shortcuts editor | An explicit requirement | 👤 |

### Stage 7: cloud and network features

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Chrome / `@browser` | **Future development** by the user (probably an MCP server of their own); nothing now, room left in the architecture | Claude in Chrome needs a claude.ai account | 👤 |
| Remote Control | **Skip** | Goes through Anthropic servers | 👤 |
| Voice dictation | **Skip** | Needs claude.ai; a local engine needs installation and a microphone in the webview | 👤 |
| `/loop` indicator | **Yes**, in the chat, no storage (interval, next run, stop) | Verified: `/loop` creates `CronCreate` and the CLI runs a turn with no user message (`command_lifecycle`), so the UI must support self-started turns | 👤 + 🔧 |

### Stage 8: shared commands, interactive mode

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Commands not supported in stream-json | **Greyed out in the `/` menu, group "בטרמינל בלבד"**; choosing one shows a Hebrew card ("זמינה רק בטרמינל") with an "open in terminal" button and is **never sent to the model**. Based on `terminal_slash_commands` (today `doctor`, `color`). Package C (2026-11-01) | `/compact`, `/rename`, `/loop` are handled in stream-json and stay available | 👤 + 🔧 |
| Message queue, Ctrl+Enter, prompt history (up arrow) | **Yes**, in memory only. **Visible queue** (grey "ממתין" bubbles with cancel; **client-side**, sent when the turn ends, not `interrupt_cancel_queued_v1`: `DECISIONS.md`) and **history per conversation** (up arrow browses that conversation's sent messages). Package C (2026-11-01) | Verified: a message mid-turn is accepted and handled after the first. Cancelling matters with a slow cold-loading model | 👤 + 🔧 |
| Switching model/mode mid-work | **Mode: the picker is disabled during an active turn** (2026-11-01; the safety rules for auto/no-permissions then apply only between turns). **Model: disabled during a turn, with a "stop and switch" button** whose Hebrew text explains what is lost: the partial answer, a running tool cut mid-way (a file may be half-written), a pending permission request | The model is switched by a restart (section 3). Decided 2026-11-01 | 👤 + 🔧 |
| `/diff` panel | **Yes. Built from the session's `Edit`/`Write` tool calls** (a list of changed files; one opens a comparison of the edited fragments through a virtual-document diff view). **No git** (2026-11-01). The diff-view module is **built once in package B** and reused by package F (per-block approval); `openDiff` closed 2026-11-09 (not built). Limit: fragments (`old_string`/`new_string`), not the whole file | The CLI does not support `/diff` in stream-json; independent of git, shows only what Claude did | 👤 |
| Claude's task list | **A checklist pinned above the prompt box** ("3/5 הושלמו", expandable, updated in place) from `TaskCreate`/`TaskUpdate` calls collected into one in-memory list. Package B starts with a short check that the local model uses these tools; if not, postpone (2026-11-01) | No `TodoWrite` in this CLI (the existing `TodoWrite` rendering in `webview/chat/tools.js` is never triggered) | 👤 + 🔧 |
| Shell mode with `!` | **Cancelled** (section 3, decision 2) | The CLI does not handle it; the model interprets it | 👤 |
| Next-prompt suggestion, emoji, automatic `/recap` | **No** | Rejected | 👤 |
| Hooks and managed settings | **No code in the extension** | Handled entirely in the CLI through `settings.json` | 👤 |

## 3. The six final decisions (asked one by one)

Decision text, alternatives and full reasons: `DECISIONS.md` 2026-11-01 "Six open decisions closed by the user". Code comments reference these numbers.

| # | Decision |
|---|---|
| 1 | **The model list is fetched from the gateway** (`GET /v1/models`, in memory, read-only; address from `ANTHROPIC_BASE_URL` or `claudeLocal.gatewayUrl`; if unavailable the current model stays). Relaxes "no network from the extension" only for the internal gateway |
| 2 | **`!` mode: give up** (not a CLI mode in stream-json; the model interprets it and runs Bash by itself) |
| 3 | **Auto mode: add with a warning** |
| 4 | **Model switch: restart the process** with `--model <id>`, the three `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` (plus `ANTHROPIC_SMALL_FAST_MODEL`, all through `--settings` since F-8) and `--resume` |
| 5 | **`claudePath` = `claude-bin.exe` + environment variables from the extension** (`API_TIMEOUT_MS=1200000`, `CLAUDE_ENABLE_STREAM_WATCHDOG=0`, `CLAUDE_CODE_MAX_CONTEXT_TOKENS=64000`, in the editable `claudeLocal.environmentVariables`) |
| 6 | **Model filtering:** auto-hide models with `extra_body.output_config.format` (`qwen2.5-coder:7b`, `gemma4:31b`) + `claudeLocal.modelDenylist` (default `gemma3:27b`) + a Hebrew message and return to the previous model on "does not support tools" |

## 4. Extension settings (prefix `claudeLocal.`)

Meaning, type and defaults: `spec.md` "Settings". Here only provenance and the package that added each setting. Source: 👤 value decided · ⚠️ my proposed default, approved 2026-11-01 ("Defaults marked ⚠️": section 6 item 7).

| Setting | Package | Source |
|---|---|---|
| `claudePath`, `environmentVariables` | A | 👤 |
| `allowDangerouslySkipPermissions`, `useCtrlEnterToSend` | existing (basic version) | 👤 |
| `preferredLocation`, `lockEditorGroups`, `useTerminal`, `enableNewConversationShortcut` | A | 👤 (values ⚠️; `preferredLocation` default was `panel`, now `sidebar` since Fix 1) |
| `gatewayUrl`, `modelDenylist` | D | 👤 |
| `ollamaUrl` | usage gauge | 👤 (approved 2026-11-08; default = the current environment's address, changeable; empty or `off` = no read) |
| `attachSelection`, `attachOpenFile`, `autosave` | F | 👤 |
| `respectGitIgnore` | C | 👤 (value ⚠️) |
| `focusView`, `showMessageTimestamps`, `spinnerVerbs`, `scrollToBottomOnSend`, `prefersReducedMotion` | G | 👤 (values ⚠️) |
| `colorMode` (`default` / `daltonized`) | G | 👤 (name and value ⚠️) |
| `keybindings.send`, `keybindings.newLine`, `keybindings.rewind` | A | 👤 (decided 2026-11-01; shortcuts inside the webview, not read from keybindings.json; `useCtrlEnterToSend` stays for compatibility) |
| `collapseUserMessageLines` | H | ✅ |
| ~~`ideServer`, `ideServerVerboseLog`~~ | F, K | removed 2026-11-09 with the IDE server |
| `logLevel` | logging (2026-11-01) | built, not in the original plan |

**VS Code-level keyboard shortcuts** are not settings but `contributes.keybindings`: Ctrl+Alt+C, Ctrl+Alt+E, Ctrl+Shift+T, Alt+K and more.

## 5. Build order

**Models: chosen per task by difficulty (`AGENT_CONTEXT.md`, user 2026-11-09); the per-package mandatory table was dropped. Fable is not used.**

| Package | Content | Depends on |
|---|---|---|
| **A** ✅ done 2026-11-01 (branch `package-a-settings-shortcuts`). **Open:** the Ctrl+Esc/Ctrl+Alt+E check on the user's machine (`SETUP.md` section 7) and the in-VS Code check of the new commands | Settings, rebindable shortcuts, Open in Terminal, `environmentVariables`, launching `claude-bin.exe` | – |
| **B** ✅ done (B1 + B2, branches `pkg-b1-sessions`, `pkg-b2-finish`; the Activity Bar tree replaced by the drawer in Fix 1). **Not built:** conversation rewind and "both" (CLI message never captured), a "move to background" button (no CLI request); both dropped by the user. Unverified in real VS Code | Sessions: Activity Bar, filters, rename, Ctrl+Shift+T, colour dots; checkpoints; background + tasks; `/diff` **(with the shared diff-view module that F reuses)**; `/loop` indicator; **agent cards, Claude's pinned task list** (both start with a check that the local model uses sub-agents / `TaskCreate`) | A |
| **C** ✅ done (branch `pkg-c-prompt-box`, built on A's branch; `@` absolute paths F-4, `/plan` notice F-5 and local commands in the `/` menu F-13 fixed 2026-11-05; **`/btw` built 2026-11-08** (neutral temp folder); **LaTeX (bundled KaTeX) built 2026-11-05**). Unverified in real VS Code | Prompt box: Auto, grouped `/` menu **(terminal-only commands greyed out)**, @-mentions, **Alt+K (`@path`)**, images, message queue **(visible, cancellable)** **+ per-conversation prompt history**, copy, `/btw` (side panel with follow-ups), plan in the editor | A |
| **D** ✅ done (branch `pkg-d-models`, built on `pkg-b1-sessions`; F-8/F-9 fixed 2026-11-05 through `--settings`). **Open:** the user's check `dev/check-model-switch.txt` on CLI 2.1.246 | Model picker, context meter, **tokens-only result line (cost removed)**, filtering, restart with `--resume` | A, C |
| **E** ✅ done 2026-11-01 (branch `pkg-e-mcp`). **Open:** nothing run in real VS Code; `claude mcp add -e` argument order and the live `mcp_status` shape unverified against the real CLI | MCP, sign-in error card, URI | A |
| **F** 🟡 built 2026-11-08 (chips, Alt+K lines, per-block diff with CodeLens or a QuickPick when `diffEditor.codeLens` is off, autosave, settings; the IDE server it first included was removed 2026-11-09, section 7; unit tests only). `openDiff` closed 2026-11-09 as redundant (not built) | Editor context (chips), **Alt+K selected lines**, per-block diff (**reuses B's diff-view module**), autosave | A, B, IDE prototype |
| **G** ✅ done (branch `pkg-g-display`, built on `pkg-b1-sessions`). Collapsing long user messages moved to H. Screen reader support dropped 2026-11-06. Unverified in browser and real VS Code | Display (focus view, timestamps, reduced motion, colour mode) | – |
| **H** ✅ built 2026-11-05 (all three; unverified in real VS Code) | **Retry after an error** ("נסה שוב", click only), **working-file button** (superseded by K), **collapsing long user messages** (display only, `claudeLocal.collapseUserMessageLines`) | A (retry: D's error card, E; working-file: C, F's chips; collapse: G) |
| **I** ✅ closed 2026-11-09: step 3 built 2026-11-05 (explorer, file or folder, the agreed instructions); step 2 **cancelled (user, 2026-11-09)**; steps 4-5 done 2026-11-09 (docs; Opus review of the code that carries it now, the file chip in `src/tagging/`, fixes in CHANGELOG). Unverified in real VS Code (`dev/check-all.txt` "בדיקה 8") | **File/folder source button.** Steps: (1) the user runs `dev/check-at-mention.txt` (its PowerShell bug `-replace '\\','/'` fixed 2026-11-05; answer 2026-11-08: the CLI does not expand `@`); (2) ~~the extension expands `@path` itself, Opus 5.5~~ cancelled; (3) replace the QuickPick in `src/panels/work-file.js` with the project's file explorer, accept folders, **Sonnet 5.5**; (4) docs, **Haiku 5.5**; (5) review before merge, **Opus 5.5**. The button itself was replaced by package K | H (working-file button), C (`@`) |
| **Fix list** | `FIXES.md`. Done: F-1 to F-5, F-7 to F-16 (F-6, the drop and the rewind button unverified in real VS Code). Open: only user checks (F-17: test 2.4 and a repeat of 7.1) | – |
| **J** (renamed from H on 2026-11-08 to end the clash with the retry / working-file / collapse package, which stays H) ✅ all eight tools built 2026-11-05/06, a ninth (`getDiagnostics`, `M-1` part a) built 2026-11-23; awaiting manual checks (c), (d), (e) | Code-navigation MCP server for JS/React (section 8): a three-tool prototype first (with a token measurement), then the rest | A, E (MCP handling); independent of F |
| **K** ✅ built 2026-11-09 (section 10; unverified in real VS Code and with the real CLI: `dev/check-all.txt` "בדיקה 8"). Agreed 2026-11-08, built by Opus 5.5 after the clarification round | **File tagging unified:** the file chip (automatic or manual through an explorer, with recents) and the lines chip (automatic, only in the chip's file); `@` and Alt+K as separate text sharing the recents and the dedupe; autosave before send; IDE server disabled ("currently not working"). Replaces the working-file / source button | C (`@`, Alt+K), F (chips, autosave), H and I (the source button it replaces) |

## 6. What is open

1. ~~IDE server~~ **Removed 2026-11-09 by the user** (`src/ide/`, its settings, lock file and tests; section 7, `DECISIONS.md`). CLI 2.1.246 never connected to it on the work machine (`DEPENDENCIES.md` rows 41-42). Editor context uses chips (section 10).
2. Direct confirmation of 64,000 for `qwen3.8:27b` with `/api/ps` while loaded: **seen 2026-11-08 and 2026-11-09 on the work machine** (CHANGELOG); the user-run `dev/check-context-window.txt` (built in package D, since removed) is superseded. **Triggered 2026-11-09:** after the switch to `qwen2.5-coder:7b` (`/api/ps` window 32,768) the setting `CLAUDE_CODE_MAX_CONTEXT_TOKENS` stayed 64000, so the CLI compacts at about 31,000 tokens (64,000 minus the 33,000 autocompact buffer) against a real window of 32,768: a margin of about 1,700 tokens that works by luck (`DEPENDENCIES.md` row 44; `dev/must-check.txt` section 6). **Approved by the user 2026-11-09 (per-model window); BUILT 2026-11-24 in a changed form (`DECISIONS.md` 2026-11-24, unit-tested only: fake CLI and fake Ollama, not real VS Code):** the window is the model's `/api/ps` `context_length` (read at conversation open, before a model switch, after each result), else the last value seen for that model, else 64,000; **the per-model setting `modelContextWindows` is dropped** (user: "I need the model's real window size and show it in the gauge"; the gateway's `max_input_tokens` is not used); every spawn passes the latest known value; an explicit user value in `environmentVariables` still wins for the CLI; Hebrew notices (explicit value differs, and real window differs from the launch window, once per process). Known limit: a model not loaded at the first spawn starts on the last seen value or 64,000. `POST :11435/api/show` is no longer needed for vision and stays a non-blocking check for tools capability.
3. The plan-approval buttons: **dropped 2026-11-09.** The user's rule of 2026-11-08 (build them only if the CLI sends `ExitPlanMode`) was applied after the check on the work machine (CLI 2.1.246, `qwen3.8:27b`): `ExitPlanMode` did not arrive, and `/plan open` said there was no plan (`DEPENDENCIES.md` row 43; `dev/must-check.txt` section 3). **Open for the user, not decided:** an "approve and implement" button after a plan-mode turn, and `/plan open` falling back to the last plan-mode message (`FUTURE_FEATURES.md` 4.3g).
4. After every package: check inside VS Code 1.91.1 and update `spec.md` (including "Settings", "Placement", "History", "Verification status"), `PROJECT_MAP.md`, `CHANGELOG.md`, `AGENT_CONTEXT.md`.
5. (Merged into item 4: the list of documents to update at the end of every package.)
6. ~~Cost removal and the mid-turn model switch~~ **Resolved 2026-11-01:** tokens only; the picker is disabled mid-turn with a "stop and switch" button and a detailed Hebrew explanation (stages 5 and 8).
7. ~~Defaults marked ⚠️ in section 4~~ **Approved 2026-11-01.**
8. ~~Retry after an error~~ **Built 2026-11-05:** button only; shown on every error result.
9. ~~IDE lock file~~ **Decided by the user 2026-11-08:** a temporary lock file with cleanup (`DECISIONS.md`); reading the CLI 2.1.246 binary showed no file-less route (an environment variable only triggers auto-connect). It was left open until the IDE server work, with the plan to test first whether an environment variable or `--ide` suffices. Moot since the IDE server was removed 2026-11-09 (section 7).
10. **Code navigation checks for the prototype** (decided 2026-11-05): (a) that the CLI shows our MCP server's tools to the model via `--mcp-config` and which transport it accepts (localhost HTTP planned; stdio through a helper script the alternative): **ran 2026-11-05 on the user's other machine against the real CLI 2.1.246 (`dev/run-h-checks.ps1`): http PASS and stdio PASS, the model called `ping` and returned the nonce** (user report; report file not in the repo); (b) the token cost of the tool list, measured with the context meter before and after (baseline 22,054 input tokens, not clean because the baseline prompt differed; re-measure); (c) that the local model chooses `readSymbol` / `documentSymbols` over reading whole files; (d) whether a `jsconfig.json` improves cross-file results in React projects; (e) accuracy of `findImporters` and reliability of `callHierarchy` in dynamic JS. **Results 2026-11-06 (real VS Code 1.91.1 code, VSCodium on Linux, `dev/nav-check`):** (d) without `jsconfig.json` the TypeScript server only knows open files and their imports (cross-file references missing; a `.jsx` import of a closed file did not resolve); the tools now open the files that mention the name and resolve such imports themselves, so all 37 checks pass with and without `jsconfig.json`, which is no longer needed. (e) `findImporters` rebuilt (section 8): 8 of 8 importers, the same-named decoy and a commented-out import excluded; `callHierarchy` incoming finds a caller through CommonJS `require` (via the definition provider); a call by computed name (`m[name]()`) cannot be found by any static tool. **Still open:** (b) token cost and (c) model choice against the real CLI and model, and one run on Windows VS Code. Model for package J: ✅ approved 2026-11-05: Opus 5.5 for the hand-written MCP protocol part, Sonnet 5.5 for the tool functions. One script, `dev/run-h-checks.ps1` (PowerShell; covers (a), (b) and the token part of (c); (c) model choice, (d), (e) need VS Code).
11. **Skipped by the user 2026-11-05, left open (do not decide without asking):** (a) retry: automatic or button only, which error types; (b) working-file button: shown only on the button or attached to the next/every message; (c) the "move to background" button (CLI cannot support it); (d) collapse length (proposed 8). **Resolved 2026-11-08 by the user: the CHANGELOG record is right (retry, working-file button and collapse are built); the contradicting notes are obsolete** (the other line of work had recorded these as settled and built under "Package H"; the two records had contradicted each other).
12. **MCP bridging (decided 2026-11-05), checks:** that the CLI sends MCP prompts to the extension in stream-json mode (in `initialize` or elsewhere) and under what names; that `mcp_status` gives each server's tool names and descriptions; that `mcp_toggle` is session-only and writes nothing to the CLI configuration. Nothing here run against the real CLI.
13. **`@path` expansion in stream-json mode** (package I step 1): answered 2026-11-08 (not expanded; if `claude` is not on PATH, the check file's `$claude` is set to its full path). Package I step 2 was cancelled by the user 2026-11-09; no longer a gate.
14. ~~Open question~~ **Closed 2026-11-17 by `R-1` (section 11): always-visible buttons replace the QuickPick fallback, so no recommendation is needed.** Was: whether to recommend turning `diffEditor.codeLens` on (VS Code hides CodeLens in diff editors by default; the per-block review then falls back to a QuickPick).

## 7. IDE server: removed 2026-11-09

**Removed by the user 2026-11-09** (`DECISIONS.md`): `src/ide/`, the settings `claudeLocal.ideServer` / `ideServerVerboseLog`, the lock file, `CLAUDE_CODE_SSE_PORT`, its tests and check script. It was built 2026-11-08 and never connected: CLI 2.1.246 in `-p` stream-json mode did not connect on the work machine, and the official extension does not use this route (an in-process SDK MCP server instead; `DEPENDENCIES.md` rows 41-42). Editor context goes as text blocks / chips (section 10); `openDiff` was redundant (section 9). If diagnostics for Claude are wanted later, the in-process SDK MCP route is the candidate (`FUTURE_FEATURES.md` 4.2e/4.3e).

## 8. Code navigation MCP server: design (decided 2026-11-05)

**Goal:** let Claude find and move around JS/React code by meaning (symbols, definitions, references) instead of only by text search, with small answers for the 64,000-token window.

**Delivery:** the extension starts a small MCP server on `127.0.0.1` (random port, random token in a header; hand-written JSON-RPC, no npm, no build) and passes it to the CLI with `--mcp-config`. No lock file, so the "writes no files" rule is untouched. There is no IDE server (removed 2026-11-09, section 7). As built: `spec.md` "Code navigation MCP server".

**Tools** (one function each in a list; `tools/list` is built from it). `getDiagnostics` was first only in the IDE server (removed 2026-11-09); **built here 2026-11-23 as the ninth tool (`M-1` part a, section 11).** `documentSymbols` and `workspaceSymbols` take a `kind` filter (function, class, variable, component-like) to keep answers small.
| Tool | VS Code API | Returns |
|---|---|---|
| `findReferences` | `vscode.executeReferenceProvider` | Locations grouped by file, one source line each |
| `goToDefinition` | `vscode.executeDefinitionProvider` (+ type definition, implementation) | Location plus a few lines of the declaration |
| `documentSymbols` | `vscode.executeDocumentSymbolProvider` | File outline (names, kinds, line ranges) |
| `workspaceSymbols` | `vscode.executeWorkspaceSymbolProvider` | Matches by name across the workspace |
| `hover` | `vscode.executeHoverProvider` | Type, signature, doc text (limited value in JS without TypeScript) |
| `callHierarchy` | `vscode.prepareCallHierarchy`, `vscode.provideIncomingCalls`, `vscode.provideOutgoingCalls` | Callers and callees; less reliable in dynamic JS |
| `readSymbol` | `documentSymbols` ranges + reading the file | The exact source of one function, component or class |
| `getDiagnostics` (2026-11-23) | `vscode.languages.getDiagnostics` | The editor's errors and warnings of one file, one line each (`line:col severity: message`), `minSeverity` default `warning`, caps 50 items / 2,000 chars, workspace path limit |
| `findImporters` | Text search for `from`/`import`/`import()`/`require` lines, each specifier resolved to the file (relative: Node rules; bare/alias: `executeDefinitionProvider` on the module string). **Changed 2026-11-06:** the first design (references of one export name) found 1 of 8 importers in real VS Code | Which files import a module |

**Design rules:**
- **Input by name:** `file` + `symbol` (optional `line`) instead of line and column, because a local model gets positions wrong; the tool resolves the name through `documentSymbols` or a text match on that line.
- **Size caps:** at most 50 results and 2,000 characters per answer, ending with "N more not shown"; adjustable after real use.
- **Permissions (2026-11-05):** `--allowedTools` for our own server only (read-only tools), so no approval card per call; other MCP servers still ask.
- **Path limit (2026-11-05):** a tool receiving a file path answers "no access" for any path outside the open workspace folders.
- **Plain failure:** when a language has no provider (e.g. `.cs`), the tool says so and Claude falls back to `Grep`.
- **Token cost:** the tool list is sent with every request; keep descriptions short and parameters few (merge tools if large). Measured in section 6 item 10.
- **Tests:** unit tests for the pure parts (result shaping, caps, name-to-position, JSON-RPC) with fake provider results; a manual check in real VS Code.

**Not decided here (`FUTURE_FEATURES.md`):** repository map, rename/refactor, and all .NET work. **First step (✅ approved 2026-11-05, after the section 6 item 10 checks had results; it depends only on packages A and E, not on F):** a prototype with three tools (`documentSymbols`, `readSymbol`, `findReferences`) to check items (a)-(c) before building the rest.

## 9. Decisions of 2026-11-08 (open-items review with the user)

| Item | Decision |
|---|---|
| "Move to background" button, conversation-only rewind and "both" | **Dropped** (the CLI supports neither) |
| Package H name clash | Navigation server package renamed **J** |
| Navigation results as clickable chat cards (`FUTURE_FEATURES.md` 1.1) | **Approved; built 2026-11-09** (the "after the open checks" condition was waived by the user). A short Hebrew card per navigation call, whose lines open the file at that line (`webview/chat/nav-results.js`; `readSymbol` and `hover` get none). Unit-tested and previewed, not seen in real VS Code |
| Open in the editor what Claude reads ("open at symbol") | **Changed by the user 2026-11-09 and built: an explicit "פתיחה בעורך" button on tool rows with a path (`Read`, `Edit`, `Write`, navigation tools), at the line or symbol when known; no setting, no auto-follow, the editor never moves by itself.** Replaces the 2026-11-08 "setting, off by default" (that setting was never built). Still not a new model tool, so no context cost |
| Repository map | **Stays in `FUTURE_FEATURES.md`**, waiting for a stronger model with the servers installed |
| Plan-approval buttons | **2026-11-09: dropped.** `ExitPlanMode` did not arrive on the work machine (`dev/must-check.txt` section 3; `DEPENDENCIES.md` row 43). Replacement proposal pending the user: `FUTURE_FEATURES.md` 4.3g |
| Automatic diff card after every edit (user request) | **Approved.** After each edit a short Hebrew card appears in the chat with a **cumulative list of every file changed in the session** and the count of added and removed lines. Clicking a file opens its diff in the editor with the existing `/diff` module (built from `Edit`/`Write` calls, no git); the diff itself is not rendered in the chat. **Shown regardless of permissions (user):** after every edit in every permission mode (including Auto and no-permissions, where no permission card appears), because it is built from the `Edit`/`Write` calls the extension sees. **The card updates in place** (one card refreshed after each edit). **Built 2026-11-09 (the "after the open checks" condition was waived by the user)** as the collapsible "שינויים בשיחה (N קבצים)" card above the composer; a replay-log snapshot, reset on a new conversation and on `/clear` (which also resets `/diff`). Unit-tested and previewed, not seen in real VS Code |
| `openDiff` in the IDE server | **Closed by the user 2026-11-09 as redundant; not built** (`DECISIONS.md` same date). Pre-edit review is the per-block review (package F: a diff in the editor, approve or reject each block); post-edit review is the "שינויים בשיחה" changes card and `/diff`. It would add no capability, and CLI 2.1.246 does not connect to our IDE server anyway (`DEPENDENCIES.md` rows 41-42), so the `ENABLE_IDE_INTEGRATION` probe is not needed for it. The IDE server itself was removed the same day (section 7) |
| .NET / C# | **Unchanged.** The user checks what is possible first (`FUTURE_FEATURES.md` section 2) |
| Usage gauge in the prompt line (user request; the user attached a screenshot of the Claude app's "Context" panel as the model) | **Approved; the card is a context breakdown of the current session.** A small gauge in the prompt-box line shows the window fill ("N% used") and opens a card in the style of that panel: a coloured bar plus rows with tokens and percent of the window for **Messages, System tools, System prompt, Skills, Memory files, Autocompact buffer, Free space**, then "System tools (deferred)" (tokens only), the memory-file count and the connected MCP-server count. Labels in Hebrew. Source: `get_context_usage` (package D); the window is the measured 64,000, not 1M. Tokens only. **Replaces the context meter's text** so there is one indicator (confirmed by the user); the last-turn usage line stays. Settles the earlier conflict with "no full `/usage` dialog": this is a small card of the current session only. **Built 2026-11-08** (unit tests and browser preview only): the window from Ollama `/api/ps` for the loaded model, falling back to `CLAUDE_CODE_MAX_CONTEXT_TOKENS`, then the CLI; setting `claudeLocal.ollamaUrl`; the `/api/ps` network exception is **approved** (`DECISIONS.md` 2026-11-08). **Open for the user:** that `get_context_usage` returns this breakdown on CLI 2.1.246 (check at build time) and the card in VS Code (`dev/check-7.html` 7.6) |
| Open-ideas review, round 2 | **Rename/refactor through VS Code:** open until after the navigation checks (then only if the local model uses the existing tools well; edits through per-block approval). **`signatureHelp`:** for when the model is stronger (overlaps `hover`). **MCP resources through `@`:** open; the CLI does not expand `@` in stream-json (answered 2026-11-08), so a resource mention probably needs another route. **.NET/C#:** unchanged |

## 10. File tagging unified: the file chip and the lines chip (user, 2026-11-08, package K)

**Status: built 2026-11-09 (Opus 5.5, after the clarification round below; Sonnet not used for this package); unit tests and browser preview checked, NOT verified in real VS Code or with the real CLI (`dev/check-all.txt` "בדיקה 8").** Behavior as built: `spec.md` "File tagging". Deviations: inline SVG icons (no icon font), folders picked while drilling the `@` menu are not added to the recents.

**Principle:** one channel. The file reaches the CLI as text in the message, `@/abs/path` (or `@/abs/path#5-10`), because the CLI does not expand `@` in stream-json mode (`DECISIONS.md` 2026-11-05). Every way of tagging produces the same text through one function; no parallel routes that can contradict each other.

| Item | Decision |
|---|---|
| Two chips above the box | **File chip** and **lines chip**. With no file open, both are shown empty |
| File chip, automatic | Follows the open file in the editor |
| File chip, click | Opens a menu: **automatic**; **"בחר קובץ..."** (a file explorer opening at the project root; one file or one folder); the **recent choices** |
| Lines chip | **Automatic only.** Shown only when the selection is in the file the file chip holds; otherwise **empty** |
| After sending | The file chip returns to automatic, **marked in a colour** with a short text ("הוחזר למצב אוטומטי"; the user replaced the original "אופס, חזר לאוטומטי" with technical wording 2026-11-09) that stays until the next action (a click, typing or another send). The previous manual choice stays in the menu |
| Recent choices | Kept (in memory), shown in the chip menu and **first in the `@` menu** |
| `@` and Alt+K | Insert `@path` as **text in the box**, separate from the chips; they add to the shared recent list. The same file in chip and text is **sent once** |
| Alt+K when the chip already shows the open file | Still inserts the text (the dedupe prevents a double send) |
| Lines are sent | **Once per change of the selection** (the block with the text, capped at 8,000 characters) |
| Unsaved file | **Saved automatically before sending** (`autosave`, `saveDirty`), so Claude reads what the user sees |
| X on a chip | **Stays** (a removed chip returns when the file or selection changes) |
| Settings `attachOpenFile`, `attachSelection` | **Stay** as off switches |
| IDE server | **Removed 2026-11-09 (section 7).** Was disabled in this package, so the selection could not reach the CLI twice |
| Supersedes | The working-file / "מקור השיחה" button (package H, package I step 3, the "Attaching files" row items 2-3): the **file chip is that button**; one control, not two |

**Clarification round answered by the user 2026-11-09 (Opus 5.5, one question at a time).** The resulting behavior is `spec.md` "File tagging"; recorded here only what the table above and the spec do not say:
- Q1 (explorer): the user said "מובנה" (built-in) → VS Code's own `showOpenDialog` at the project root (one file or one folder), as package I step 3.
- Q2: **one uniform context line** for automatic and manual choices, at the top of the message: `[הקשר מהעורך] הקובץ: @path` / `[הקשר מהעורך] התיקייה: @path` (**line format superseded 2026-11-09:** model-bound text is English and the context travels as `<ide_opened_file>` / `<ide_selection>` blocks, `DECISIONS.md` 2026-11-09, `spec.md` "File tagging"); the old "מקור השיחה" sentences are dropped. Q3: a folder is sent as the path only (the model decides what to read), the chip shows a folder codicon.
- Q4 (the "back to automatic" mark must follow the VS Code theme and the colour-blind mode): originally the chip border and text in the theme's info colour (`editorInfo.foreground`); **changed 2026-11-09** to the text "הוחזר למצב אוטומטי" next to the chip in the Claude orange (blue dropped with the official-look restyle).
- Q5: recents = 5 items, shared by all conversations, memory only. Q6: empty chips show grey hints "אין קובץ" / "אין בחירה"; the empty file chip is clickable (same menu), the empty lines chip is not. Q7: a manual path outside the workspace is allowed, tooltip "מחוץ לפרויקט", the CLI asks its own permission. Q8: `ideServer` default false with description starting "לא עובד כרגע (נבדק)", the 30 s "no client" notice stays (fires only for whoever turns the server on), `src/ide/` unchanged.
- Q9 (tests): unit tests for the single mention function, the dedupe and the recent list; a browser-preview check (chips, menu, colour mark, dark/light); a new section in `dev/check-all.txt` for the user's real VS Code check.

## 11. Decisions of 2026-11-17 (product proposal review with the user)

Source: `PRODUCT_PROPOSAL.md` (Hebrew research document comparing the extension with the official `anthropic.claude-code` 2.1.322; proposal ids such as `L-1`, `M-1` are defined there). Eight questions were asked one at a time. **Built so far: `M-1` (2026-11-23), `L-1`, `R-1` and `M-3` (2026-11-24, see their rows); the rest is not built.**

| Item | Decision |
|---|---|
| Product direction (question 1) | **Combined.** First the best front for a local, slow and weak model (proposal groups L and M); plus two gaps against the official extension, `M-1` and `R-1`. Other gaps are closed only when they help in this environment |
| Control-request probe (question 2) | **Approved, to be written in a separate session.** One dev-only self-contained check file under `dev/` (delivered as TXT, UTF-8 with BOM and CRLF) that sends each control request found in the official 2.1.322 bundle to CLI 2.1.246 and records supported / unsupported and the response shape: `side_question`, `get_plan`, `background_tasks`, `get_task_output`, `hooks` in `initialize` with `hook_callback`, an `sdk`-type MCP server with `mcp_message`, `systemPrompt` / `appendSystemPrompt` in `initialize`, `apply_flag_settings`, `get_settings`, `export_conversation`, `get_skills_dialog`, `list_permission_rules`, `get_memory_dialog` (`PRODUCT_PROPOSAL.md` section 4). None of these is verified on 2.1.246 |
| CLI upgrade to 2.1.322 on the work machine (question 3) | **Decide after the probe results.** No upgrade and no file brought in until then. **Probe results arrived 2026-11-17 (`DEPENDENCIES.md` row 45):** `side_question`, `get_plan`, `background_tasks`, hooks (`hook_callback`), SDK MCP (`mcp_message`) and `appendSystemPrompt` all work on 2.1.246; only the dialogs (skills, permissions, memory, hooks), `get_task_output` and `export_conversation` need a newer CLI. **Decided by the user 2026-11-17: no upgrade now; stay on 2.1.246.** Revisit only if a needed feature requires a newer CLI. Still open: the hook answer format (the `additionalContext` did not reach the model's reply) |
| `L-1` model-loaded indicator (question 4) | **Approved: indicator only.** Next to the usage gauge: loaded and when it unloads, or not loaded, read from the existing read-only `GET /api/ps` (to check: that `expires_at` is returned). **The extension sends no request of its own to keep the model warm;** keep-alive is set on the server (`keep_alive`). The network exception is not widened. **Built 2026-11-24, unit-tested only (fake Ollama; 345/345), not seen in real VS Code or against real Ollama; the `expires_at` check is still open:** "טעון עד HH:MM" / "טעון קבוע" / "לא טעון" from the same response as the window, hidden when Ollama is off or unreachable (`DECISIONS.md` 2026-11-24) |
| `M-1` editor diagnostics to the model (question 5) | **Approved, top of the queue, two parts:** (a) a "problems in file" tool in the navigation MCP server (`vscode.languages.getDiagnostics`); (b) after an edit, the new diagnostics of the edited file go to the model as an English text block with the next user message (only new ones, only that file). Upgrade (b) to a same-turn `PostToolUse` hook only if the probe shows `hook_callback` works on the CLI. **Built 2026-11-23, both parts, unit-tested only (316/316), not seen in real VS Code or the real CLI:** (a) the ninth nav tool `getDiagnostics`; (b) the `<ide_diagnostics>` block with the next message (baseline at the edit's `tool` event, new errors/warnings of the edited file only, `spec.md` "File tagging"). The same-turn hook upgrade is **pending**: `hook_callback` works on 2.1.246 (`DEPENDENCIES.md` row 45) but the answer format that reaches the model is not settled. The same session fixed two bugs: the file/selection context is resent after a compaction, and the replay log is size-capped. Moves `FUTURE_FEATURES.md` 4.2e and 4.3e here |
| `R-1` per-block approval buttons (question 6) | **Approved: always-visible buttons plus CodeLens.** Accept / reject buttons attached to each block through the comments API (shown regardless of `diffEditor.codeLens`), accept / reject for the whole file in the editor title, and "accept / reject change at cursor" commands. The QuickPick fallback is removed; CodeLens stays for users who turned `diffEditor.codeLens` on. Closes section 6 item 14. **Decided by the user 2026-11-24:** above 100 blocks in a file there are no per-block buttons (only the editor-title buttons and the cursor commands), as in the official extension; each block starts "pending" and the decision is sent automatically when the last block is decided (editor-title accept-all / reject-all decide the rest and send at once), replacing "all accepted by default plus an explicit send". **Built 2026-11-24, unit-tested only (374/374), not seen in real VS Code or the real CLI:** comment threads on the proposed side (`src/diff/block-comments.js`), pure state (`src/diff/block-state.js`), title buttons, cursor commands (command palette only, no right-click menu or key binding), QuickPick removed, CodeLens kept for `diffEditor.codeLens` users. Build-time choices (not by the user): a cancel button was added (editor-title overflow and CodeLens), thread labels and the info messages; see `DECISIONS.md` 2026-11-24 |
| `M-3` guidance toward the navigation tools (chosen by the user 2026-11-24 from the later review) | **Approved and built 2026-11-24, unit-tested only (410/410), not seen in real VS Code or the real CLI:** a short English text (about 55 tokens) through `appendSystemPrompt` in `initialize`, only when the nav server started. **Decided by the user:** a setting `claudeLocal.navGuidance`, boolean, default on, applies from a new conversation (so a before/after count is possible). Build-time defaults (not asked): bare tool names in the text; text fixed per conversation (an MCP-panel toggle mid-conversation does not change it); the `--append-system-prompt` flag not used (unverified in stream mode). Open: that the lines arrive in the real extension, and the measurement (nav-tool calls against `Grep`/`Read`, setting on versus off). `DECISIONS.md` 2026-11-24 |
| The 2026-11-10 review (`REVIEW.md` on branch `ccr-60bce727-nx590z`) (question 7) | **Absorbed into `PRODUCT_PROPOSAL.md` appendix A; the branch stays on GitHub, unmerged** |
| Proposals with no counterpart in the official extension (user, 2026-11-24) | **Removed from the plan:** `L-2` to `L-9`, `M-2`, `M-5`, `M-7`, `M-8`, `X-2`, `A-5` (and the matching `FUTURE_FEATURES.md` ideas). Kept: the gaps against the official extension (`P-1`-`P-3`, `R-2`, `R-4`, `Q-1`-`Q-10`, `M-4`, `M-6`, `X-1`, `X-3`-`X-6`, `A-3`, `A-4`, `A-6`) and the infrastructure `A-1`, `A-2` (user chose to keep them). Not yet decided whether to build each one |
| **GUI-only rule (user, 2026-11-24)** | **"I want only a GUI for the CLI; what does not come from there should not appear."** Every planned item that does not meet it is rejected: `P-1`, `P-2`/`R-3` (approve-and-implement, 4.3g), `P-4`, `Q-2`, `Q-3`, `Q-10`, `X-1`, `X-5`, `X-6`/C# option A, the `M-1` same-turn hook upgrade, and `FUTURE_FEATURES.md` 1.2 repository map, 1.3 rename, 3.3 resources through `@`, 4.1f, 4.2a, 4.2b, 4.2d, 4.3b, 4.3d. Still in the plan, undecided: `P-3`, `R-4`, `Q-1`, `Q-6`, `Q-8`, `M-4`, `M-6`, `X-3`, `X-4`, `A-1`, `A-2`, `A-4`, `A-6`; borderline (display of CLI data, asked one by one): `R-2`, `Q-4`, `Q-5`, `Q-7`, `Q-9`, 4.1b. Features already built that originate in the extension (nav MCP server, `M-1`, `M-3`, `L-1` and the Ollama window, editor-context blocks) are asked separately |
| **Review under the GUI-only rule (user, 2026-11-24, one by one)** | **Build:** `P-3` run in background; `Q-1` initial permission mode (CLI `--permission-mode`); `Q-6` live status-bar item with a turn timer; `Q-8` open the project `CLAUDE.md` only (no token count); `R-2` edit the proposal in the diff before approval (`updatedInput`); `Q-5` focus-view command, shortcut and `/` toggle; `Q-7` own font-size setting; `Q-9` search inside the open conversation and in the conversation list. **Build only if the CLI 2.1.246 supports it (check first):** `R-4` live command output; `M-4` output-style picker; `X-3` worktree through the CLI flag. **Wait for a CLI upgrade:** `M-6` skills toggles, `X-4` permission-rules view, `Q-4` `/export` and `/copy N` (no extension-made export). **Check only, no extension code:** `FUTURE_FEATURES.md` 4.1g (autocompact env vars; a `SETUP.md` line if they work). **Rejected:** `P-1` (`/btw` through `side_question`), `FUTURE_FEATURES.md` 4.1b (own system-prompt setting). **Infrastructure kept:** `A-1`, `A-2`. **Already-built extension-originated features stay** (nav MCP server with its nine tools, `M-3`, nav cards, `M-1` diagnostics block, `L-1` and the Ollama window, the changes card): the rule applies to new work only |
| All other proposals (question 8) | **Stay in `PRODUCT_PROPOSAL.md`, undecided,** to be reviewed one by one in a later session (`FUTURE_FEATURES.md` section 5 points there) |
