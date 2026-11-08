# Plan: every decision and its reason

Updated: 2026-11-05. This is the **single source of truth for what to build next**. The old historical log (`features-plan.md`) was merged into this file and `DEPENDENCIES.md` and deleted; `DECISIONS.md` holds the architecture-level decisions in full format (alternatives and reasons). What exists today is described in `spec.md`; the measured facts behind the decisions are in `DEPENDENCIES.md`.

**Source of each decision:** 👤 the user decided (question and answer) · ✅ a recommendation the user approved · 🔧 derived from a check against the CLI/gateway (a factual reason) · ⚠️ my adjustment that was not asked explicitly (awaiting approval).

## 1. Base facts that affect everything

| Fact | Value | Source |
|---|---|---|
| Environment | A machine that will end up without internet; local model `qwen3.8:27b` through the LiteLLM 1.80.0 gateway (`172.27.5.5:11436`) over Ollama (`:11435`) | `SETUP.md`, checks |
| The CLI | Claude Code 2.1.246 (`claude-bin.exe`) | checks |
| VS Code | 1.91.1 (no secondary side bar; every API must fit) | checks |
| Internet | **None on the user's machine.** A few files can be brought in; nothing is installed from the network; code libraries only in special cases with no other way (rule in `AGENT_CONTEXT.md`) | User, 2026-11-05 | 👤 |
| Principles | The extension stores no data; the CLI is the source of truth; plain JS with no build and no npm; every user-facing string in Hebrew | `spec.md` |
| Real context window | **64,000 measured for `gemma4:26b`** (`/api/ps`); for `qwen3.8:27b` **at least 50,000 measured** (no plateau), and 64,000 is an **assumption** (the window is probably set at server level, so it applies to all models) to be confirmed with `/api/ps` at the start of package D. The gateway setting (12,288) is not enforced. Claude Code itself sends about 25,000 tokens for a simple message, so the context meter starts at roughly 40% | 🔧 |
| Cold model load | 285 seconds; keep-alive about 5 minutes | 🔧 |

## 2. Decisions by topic

### Stage 1: opening, launching and placement

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Open in Terminal | **Yes** | Runs the CLI's original interface in VS Code's terminal; also a fallback for commands the chat does not support | 👤 |
| Activity Bar icon for a session list | **Yes** (depends on stage 4) | A dedicated list of previous conversations instead of a button inside the chat | 👤 |
| Open in New Window | **No** | Not chosen; low value when working in one window | 👤 |
| Sign-in screen / onboarding checklist | **None.** Instead, a Hebrew card in the chat when the CLI fails (check `ANTHROPIC_BASE_URL`, that the server runs, `claudePath`, a button that opens `settings.json`). **Also a warning in the same card when `claudePath` resolves to a `.cmd`/`.bat` wrapper** (it asks "Select model number" and hangs the extension), with a button that opens the setting (decided 2026-11-01) | Local model, no login; the helpful instructions are the connection settings | 👤 |
| Retry after an error | **✅ built 2026-11-05:** **A "נסה שוב" (Try again) button** on the error card, and on a failed send, for connection and sign-in-type errors (for example the server not running or the CLI failing to start). It re-sends the same request and does not retry on its own. Proposed: one click per attempt, no automatic loop, and no change to the text the user wrote | Requested 2026-11-03 as a future feature; details (automatic or button only, which errors count, number of attempts) to confirm with the user before building | ✅ built (button only, any error result) |
| URI links | **Yes, with confirmation before sending** (`vscode://local.claude-local/open`, parameters `prompt`, `session`) | The text goes into the box and is not sent automatically, to prevent prompt injection from an external link | 👤 |
| Panel placement | Settings `preferredLocation` (tab/sidebar) and `lockEditorGroups` | The user asked to offer both options as settings | 👤 |

### Stage 2: the prompt box

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Auto mode | **Yes, with a Hebrew warning in the picker** ("ה-CLI מחליט לבד, המסווג עלול לטעות") | `set_permission_mode auto` was accepted and Write ran without a question; the classifier's behaviour with a local model on dangerous actions was not tested | 👤 + 🔧 |
| `/plan`, `/plan open` | **Yes** (implemented in the extension, not in the CLI's command list) | Plan mode exists; the commands do not appear in `initialize` | 👤 + 🔧 |
| Plan as a document | **Version B:** an "open in editor" button that opens a read-only virtual Markdown document (`TextDocumentContentProvider`, no file written). No inline comments | Keeps "no storage"; version C (inline comments) is very heavy (about 250 lines) | 👤 |
| Source of the plan text | From the assistant's text messages before `ExitPlanMode` (not from `input.plan`, which arrives empty) | Observed in the checks | 🔧 |
| Plan approval buttons | **Postponed to the end, not critical** (they do not appear now) | Check whether the CLI sends `ExitPlanMode`; the model once used `AskUserQuestion` | 👤 |
| `/` menu | **Groups + a distinction between skills and built-in commands** | `system/init` has `skills` against `slash_commands` and `terminal_slash_commands` | 👤 + 🔧 |
| @-mentions | **Files and folders only** | `@terminal` depends on a limited VS Code API; `@browser` needs Chrome and is irrelevant offline | 👤 |
| Images and files | **Paste images, drag files (Shift), PDF and LaTeX (LaTeX rendering built 2026-11-05).** **No control by model:** images are always accepted, with no `visionModels` setting, no warning and no blocking (decided 2026-11-01) | Vision was verified only on `qwen3.8:27b`; gateway capability flags are unreliable and `/api/show` is not exposed. The earlier requirement to hide/disable images for models without vision is **dropped**; PDF is read by the CLI (needs poppler); LaTeX uses a bundled KaTeX (done) | 👤 + 🔧 |
| Attaching files (decided 2026-11-05, discussion session) | **(1) `@` behaves exactly like the CLI:** a one-time tag; the file content enters the context once and stays in history; a folder gives a listing only. No visible list of attached files and no removable chips (the CLI has neither). **(2) The working-file button becomes a source button:** it opens the project's file explorer, a file or a folder can be chosen; the choice sends an instruction before the next message, once, repeated only when the choice changes. File: `זה קובץ המקור של השיחה הזו: @path. קרא אותו ותתחיל לעבוד ממנו.` Folder: `זו תיקיית המקור של השיחה הזו: @path. עבור על התוכן שלה ותתחיל לעבוד ממנה.` **(3)** One item at a time. **(4)** In memory only: lost on closing the conversation or reloading the window; nothing stored, no change to `DECISIONS.md`. **(5)** Images and PDF: unchanged, only the path is sent and the model opens them with its read tool | The CLI has no attached-files list: attachment is a one-time tag kept in history (`--resume` restores it, so the CLI stays the source of truth). Whether the CLI expands `@path` in stream-json mode is still unverified (`dev/check-at-mention.txt`) | 👤 |
| Thinking | **Removed** | No thinking blocks and 0 thinking tokens | 🔧 |
| Effort | **Removed** | `output_config.effort: high` is fixed in the gateway; the check showed no difference | 🔧 |
| Ultracode, cache clock | **No** | Anthropic features, irrelevant to a local model | 👤 |
| A copy button on every answer | **Yes** | Simple and useful | 👤 |
| `/btw` panel | **Yes** (a side question with no tools and no history) | Chosen by the user | 👤 |
| Bookmarks | **No** | They need storage and contradict "no storage" | 👤 |
| Context meter + `/compact` | **Yes**, by `get_context_usage` and `CLAUDE_CODE_MAX_CONTEXT_TOKENS=64000`. No cost | The CLI assumes 200,000 for an unknown model; the cost it reports is meaningless | 👤 + 🔧 |
| Agent map | **A collapsible card in the chat** per sub-agent call (state: running / finished; when opened, the tools it ran, grouped by `parent_tool_use_id`). No separate panel. Package B, which starts with a short check against the real CLI that the local model launches sub-agents at all; if it does not, postpone (decided 2026-11-01) | Sub-agent messages are filtered out today (`event-translator.js`); the data is available. The local model may rarely use sub-agents | 👤 |

### Stage 3: editor context and change review

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Automatic context (selection and open file) | **First try through an IDE server; if it does not work, fall back to chips** above the box (`קובץ: app.ts`, `שורות 5–10`, removable) | The user wanted to try the official way first; the IDE server has not been tested yet (`/ide` does not detect, `~/.claude/ide` does not exist) | 👤 |
| Working-file button | **✅ built 2026-11-05 (the file is handed to the model once per change):** **A button only** (no other controls), showing the file the work is on; by default the open file. Clicking it opens a file picker so the user can choose another file, looking like VS Code's own picker where VS Code has one. **When no file is open, the button still shows**, and clicking it lets the user pick a file | Requested 2026-11-03; compare with Alt+K (inserts `@path` of the open file, a one-off action) and the planned chips. Open: whether the chosen file only shows on the button or is also attached to every message | ✅ built |
| Alt+K | **Yes** (inserts `@path#lines`). **Split:** package C inserts `@path` of the open file; package F adds the selected lines (decided 2026-11-01) | Depends on @-mentions (C) and editor context (F) | 👤 |
| Settings `attachSelection`, `attachOpenFile`, `respectGitIgnore` | **Yes**, on by default | Control over the automatic context | 👤 |
| diff on edits | **Approve each change block separately** (CodeLens, returned to the CLI as `updatedInput`) | Verified: the CLI honoured our change (`PROBE_CHANGED` went into the file). The alternative (approve everything) is not needed | 👤 + 🔧 |
| autosave | **Yes**, on by default | So Claude sees the current file on disk | 👤 |

### Stage 4: sessions, history, checkpoints, background

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Rename a session | **Yes, through the CLI's `/rename`** | Verified: `custom-title` is written to the jsonl | 👤 + 🔧 |
| Filters (active / waiting / finished) | **Yes**, temporary, no storage | Chosen, and fits "no storage" | 👤 |
| Archiving and session groups | **No** | The CLI does not archive, and adding it in the extension needs storage. The option was asked and the user chose "do not archive" | 👤 |
| Reopen (Ctrl+Shift+T), colour dots on tabs | **Yes** (an in-memory list only; marked through name/icon because there is no colour API). Meaning of the colours: **blue = waiting for permission, orange = finished in a hidden tab** | Chosen | 👤 |
| `continueAfterReload` | **As a suggestion only**: "continue the last conversation", read from the transcripts | Contradicts "no restore after refresh", so it is implemented with no stored state | 👤 + ⚠️ |
| Web tab | **No** | Anthropic cloud infrastructure, no internal server | 👤 |
| Checkpoints | **Full:** fork, rewind code, both, Esc Esc | Verified: rewind worked when the process was started with `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1` and `--replay-user-messages` (the saved setting `checkpoints=true` is not enough); fork works | 👤 + 🔧 |
| Background | **A "move to background" button + a task map with stop** | Verified: `task_started`, `background_tasks_changed`, `stop_task` | 👤 + 🔧 |

### Stage 5: environment integration

| Feature | Decision | Reason | Source |
|---|---|---|---|
| IDE server | **A local WebSocket server + context + getDiagnostics.** `executeCode` (Jupyter): no. **A feasibility check first (my prototype)** | We need to know whether the CLI connects; if not, the chips fallback | 👤 |
| Code navigation for Claude (future, not built; decided 2026-11-05) | **Tools backed by VS Code's own language features** (already LSP-backed; the extension runs no language server and installs nothing). **Delivered through an MCP server of our own** (passed to the CLI with `--mcp-config`, no lock file). The IDE server (next row) is **not** used for navigation; it keeps editor context and `openDiff`. **Scope now: JavaScript and React only** (the TypeScript language service built into VS Code); .NET/C# stays future development (`FUTURE_FEATURES.md` section 2). Tools, design and open checks: section 8 | Claude today navigates only by text (`Grep`/`Glob`/`Read`), which costs context in a 64,000 window; symbol-level answers are much smaller. Verified by the user on 2026-11-05: JS/React navigation works in VS Code with no extension installed; no C# extension is installed | 👤 |
| MCP | **A full management dialog, including add and remove from the UI** (list + status, enable/disable, reconnect). OAuth: no. **Principle (2026-11-05): the extension is only a bridge to the CLI, for using MCP servers and turning them on or off in a session; no new editing features, and the existing add/remove buttons stay as built.** **Additions (decided 2026-11-05):** (1) each server's tool list in the dialog, read-only; (2) MCP prompts as commands in the grouped `/` menu, if the CLI sends them in stream-json; (3) a check that a per-session on/off is not written to the CLI's configuration. MCP resources through `@` were not chosen (`FUTURE_FEATURES.md` section 3) | Verified: `mcp_status`, `mcp_reconnect`, `mcp_toggle` work, and so do `claude mcp add/remove` | 👤 + 🔧 |
| Plugins and Mods | **Skip** | Marketplaces on GitHub, does not work offline | 👤 |
| Git | **No change** (through Bash); no PR status | Already works, and the status needs GitHub | 👤 |
| Session usage line | **Tokens only, no cost.** A full `/usage` dialog: no. Git status in the box line: no. **Separate from the context meter**: the meter (package D) shows the window fill now ("הקשר: 23,400 / 64,000"); the usage line shows the last turn ("תור: קלט · פלט"). **Removing the cost is done in package D** (one line in the existing result line), not in E (decided 2026-11-01) | The cost the CLI reports is meaningless (`costBasis: unknown`), and nothing costs money here. The two components come from different sources (`get_context_usage` vs the `result` message) | 👤 + 🔧 |

### Stage 6: display, accessibility, settings, shortcuts

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Display | **Focus view, timestamps, `spinnerVerbs`, `scrollToBottomOnSend`** | All chosen; light and independent | 👤 |
| Collapsing user messages | **A function that collapses long user messages in the thread** (display only): a message above a set length shows its first lines with a "הצג עוד" / "כווץ" toggle; the text sent to the CLI and the saved transcript are not changed. The length limit is a proposed setting (`claudeLocal.collapseUserMessageLines`, proposed default 8 lines, not yet decided). Short messages are never collapsed | Requested 2026-11-02 on branch `develop`; read as display-only; to confirm with the user | ✅ built 2026-11-05 (8 lines, setting) |
| `useTerminal` | **A setting** that makes the main button open a terminal | Chosen | 👤 |
| Accessibility | **Colour settings only** (`prefersReducedMotion`, daltonized). **Screen-reader support (announcements, speaker labels, navigation by headings) removed from the plan on 2026-11-06: not needed** | The user decided it is unnecessary | 👤 |
| More settings | **`enableNewConversationShortcut` (Ctrl+N), `environmentVariables`** | Chosen | 👤 |
| `claudeProcessWrapper`, `usePythonEnvironment`, `enableReopenClosedSessionShortcut`, `disableLoginPrompt` | **No** | Not needed (a wrapper is possible in the future; no login; Ctrl+Shift+T is already decided) | 👤 |
| Shortcuts | **Ctrl+Alt+E** (editor↔chat, replaced Ctrl+Esc) + **Ctrl+Alt+C** to open; Ctrl+Shift+Esc removed (decided 2026-11-05) | Ctrl+Shift+Esc is taken by Windows Task Manager | 👤 |
| Rebindable shortcuts | **All shortcuts** (as `contributes.keybindings` with a command "Claude Code Local: Keyboard Shortcuts" that opens `workbench.action.openGlobalKeybindings` filtered to `claude-local`). **Shortcuts inside the webview** (Enter, Shift+Enter, Esc Esc): **settings `claudeLocal.keybindings.*`** (decided 2026-11-01); limitation: the webview does not see VS Code's keybindings automatically, so these are separate from the VS Code shortcuts editor | An explicit requirement | 👤 |

### Stage 7: cloud and network features

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Chrome / `@browser` | **Future development** by the user (probably an MCP server of their own); nothing for now, and room is left in the architecture | Claude in Chrome needs a claude.ai account | 👤 |
| Remote Control | **Skip** | Goes through Anthropic servers | 👤 |
| Voice dictation | **Skip** | Needs claude.ai; a local engine needs installation and a microphone in the webview | 👤 |
| `/loop` indicator | **Yes**, in the chat, no storage (interval, next run, stop) | Verified: `/loop` creates `CronCreate` and the CLI runs a turn with no user message (`command_lifecycle`), so the UI must support turns that start by themselves | 👤 + 🔧 |

### Stage 8: shared commands, interactive mode

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Commands not supported in stream-json | **Greyed out in the `/` menu, in a separate group labelled "בטרמינל בלבד"**; choosing one shows a Hebrew card ("זמינה רק בטרמינל") with an "open in terminal" button and is **never sent to the model**. Based on `terminal_slash_commands` (today `doctor`, `color`). Package C (decided 2026-11-01) | `/compact`, `/rename`, `/loop` are handled in stream-json and stay available | 👤 + 🔧 |
| Message queue, Ctrl+Enter, prompt history (up arrow) | **Yes**, in memory only. **A visible queue** (grey bubbles marked "ממתין" with a cancel button; **built client-side** (held in the webview, sent when the turn ends), not with `interrupt_cancel_queued_v1`, see `DECISIONS.md`) and **history per conversation** (up arrow browses that conversation's sent messages only). Package C (decided 2026-11-01) | Verified: a message mid-turn is accepted and handled after the first. Cancelling matters with a slow cold-loading model | 👤 + 🔧 |
| Switching model/mode mid-work | **Mode: the permission-mode picker is also disabled during an active turn** (decided 2026-11-01, replaces the earlier "Mode: yes"; the safety rules for auto/no-permissions then only apply between turns). **Model: the picker is disabled during an active turn, with a "stop and switch" button** whose Hebrew text explains in detail what is lost: the partial answer, a running tool cut mid-way (a file may be left half-written), a pending permission request | The model is switched by a restart (see below). Decided by the user on 2026-11-01 | 👤 + 🔧 |
| `/diff` panel | **Yes. Built from the session's `Edit`/`Write` tool calls** (a list of changed files; choosing one opens a comparison of the edited fragments in the editor through a virtual-document diff view). **No git involved at all** (decided 2026-11-01). The diff-view module is **built once in package B** and reused by package F (per-block approval) and by the IDE server's `openDiff`. Limit: fragments (`old_string`/`new_string`), not the whole file | The CLI does not support `/diff` in stream-json, so the extension implements it. Independent of git, shows only what Claude did | 👤 |
| Claude's task list | **A checklist pinned above the prompt box** ("3/5 הושלמו", expandable, updated in place), built on `TaskCreate`/`TaskUpdate` calls collected into one in-memory list. Package B, which starts with a short check that the local model uses these tools; if it does not, postpone (decided 2026-11-01) | There is no `TodoWrite` in this CLI (the existing `TodoWrite` rendering in `webview/chat/tools.js` is never triggered) | 👤 + 🔧 |
| Shell mode with `!` | **Cancelled** (see decision 2) | The CLI does not handle it; the model interprets it | 👤 |
| Next-prompt suggestion, emoji, automatic `/recap` | **No** | Rejected | 👤 |
| Hooks and managed settings | **No code in the extension** | Handled entirely in the CLI through `settings.json` | 👤 |

## 3. The six final decisions (asked one by one)

| # | Decision | Detailed reason |
|---|---|---|
| 1 | **The model list is fetched from the gateway** (`GET /v1/models`, in memory, read-only; the address from `ANTHROPIC_BASE_URL` or `claudeLocal.gatewayUrl`; if the gateway is unavailable, the current model stays) | The CLI returns no list (4 aliases of the same model), and your wrapper fetches it from the same place. Checked from inside VS Code and it works (15 milliseconds, no key, no proxy). It relaxes the rule "no network from the extension" only for the internal gateway |
| 2 | **`!` mode: give up** | There is no such mode in the CLI in stream-json mode; the model interprets it and runs Bash by itself, which is not reliable |
| 3 | **Auto mode: add with a warning** | Verified that it works; a classifier on a local model may err on dangerous actions, hence the warning |
| 4 | **Model switch: restart the process** with `--model <id>`, the three `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` (plus `ANTHROPIC_SMALL_FAST_MODEL`, all through `--settings` since F-8: `DECISIONS.md` 2026-11-05) and `--resume` | `set_model` at run time is always accepted without validation and the error arrives only in the next turn; choosing at start-up was verified and works (`gemma4:26b`). The session title is created by a call to the HAIKU model, so without changing it the server loads two models (cold load = 285 seconds) |
| 5 | **`claudePath` = `claude-bin.exe` + environment variables from the extension** (`API_TIMEOUT_MS=1200000`, `CLAUDE_ENABLE_STREAM_WATCHDOG=0`, `CLAUDE_CODE_MAX_CONTEXT_TOKENS=64000`, in the editable setting `claudeLocal.environmentVariables`) | The `claude.cmd` wrapper asks "Select model number" before every run and would hang the extension; the long timeout is essential because of the cold load; the context window was measured |
| 6 | **Model filtering:** automatically hide models with `extra_body.output_config.format` (`qwen2.5-coder:7b`, `gemma4:31b`) + `claudeLocal.modelDenylist` (default `gemma3:27b`) + a Hebrew message and a return to the previous model on a "does not support tools" error | The capability data in the gateway is not reliable; two models are configured for JSON-title-only output; `gemma3:27b` fails with "does not support tools"; the other models were not tested with tools |

## 4. Extension settings (prefix `claudeLocal.`)

Source of values: 👤 a value that was decided · ⚠️ my proposed default, not asked explicitly (awaiting approval before package A). **Existing today in `package.json`:** `claudePath`, `allowDangerouslySkipPermissions`, `useCtrlEnterToSend`. All the others are new and will be added in the packages named.

| Setting | Type | Default | Meaning | Package | Source |
|---|---|---|---|---|---|
| `claudePath` | string | `claude` (on this machine set an explicit path to `claude-bin.exe`, see `SETUP.md` section 4) | The CLI executable | A | 👤 |
| `allowDangerouslySkipPermissions` | boolean | `false` | Shows the "no permissions" mode | existing | 👤 |
| `useCtrlEnterToSend` | boolean | `false` | Ctrl+Enter sends, Enter inserts a new line | existing | 👤 |
| `environmentVariables` | object (name→string) | `{"API_TIMEOUT_MS":"1200000","CLAUDE_ENABLE_STREAM_WATCHDOG":"0","CLAUDE_CODE_MAX_CONTEXT_TOKENS":"64000"}` | Environment variables for the CLI process; merged over the environment, and the connection variables stay in the CLI's `settings.json` | A | 👤 |
| `preferredLocation` | enum `panel` / `sidebar` | `panel` | Where the chat opens from the main button | A | 👤 (value ⚠️) |
| `lockEditorGroups` | boolean | `false` | Lock the tab's editor group | A | 👤 (value ⚠️) |
| `useTerminal` | boolean | `false` | The main button opens the CLI in a terminal instead of the chat | A | 👤 (value ⚠️) |
| `enableNewConversationShortcut` | boolean | `false` | Ctrl+N for a new conversation | A | 👤 (value ⚠️) |
| `gatewayUrl` | string | empty (taken from `ANTHROPIC_BASE_URL`) | Gateway address for fetching `/v1/models` | D | 👤 |
| `modelDenylist` | string[] | `["gemma3:27b"]` | Models to hide from the picker | D | 👤 |
| `attachSelection` | boolean | `true` | Attach the editor selection to the context | F | 👤 |
| `attachOpenFile` | boolean | `true` | Attach the open file to the context | F | 👤 |
| `respectGitIgnore` | boolean | `true` | Respect `.gitignore` files in @ completion | C | 👤 (value ⚠️) |
| `autosave` | boolean | `true` | Save the editor after a Claude edit | F | 👤 |
| `focusView` | boolean | `false` | Focus mode in the chat | G | 👤 (value ⚠️) |
| `showMessageTimestamps` | boolean | `false` | Timestamps on messages | G | 👤 (value ⚠️) |
| `spinnerVerbs` | string[] | empty (the extension's default) | Waiting words in the work indicator | G | 👤 (value ⚠️) |
| `scrollToBottomOnSend` | boolean | `true` | Scroll to the bottom on send | G | 👤 (value ⚠️) |
| `prefersReducedMotion` | boolean | `false` | Turn animations off | G | 👤 (value ⚠️) |
| `colorMode` | enum `default` / `daltonized` | `default` | Colour scheme for colour-blind users | G | 👤 (name and value ⚠️) |
| `keybindings.send`, `keybindings.newLine`, `keybindings.rewind` | string | `Enter`, `Shift+Enter`, `Escape Escape` | Shortcuts inside the webview, as settings (not read from keybindings.json). `useCtrlEnterToSend` stays for compatibility and swaps the `send`/`newLine` defaults | A | 👤 (decided 2026-11-01) |

**VS Code-level keyboard shortcuts** are not settings but `contributes.keybindings`: Ctrl+Alt+C, Ctrl+Alt+E, Ctrl+Shift+T, Alt+K and more.

## 5. Build order

**Models are mandatory (see `AGENT_CONTEXT.md`, "Models: mandatory"): Sonnet 5.5 for packages A, C, E, G and the simple parts of B; Opus 5.5 for the protocol-sensitive parts of B, for D's restart/`--resume`, for F, and for review. Fable is not used; Opus is the maximum.**

| Package | Content | Depends on |
|---|---|---|
| **A** ✅ done 2026-11-01 (branch `package-a-settings-shortcuts`) | Settings, rebindable shortcuts **(including Ctrl+Esc, tested on the user's machine for the Start-menu conflict)**, Open in Terminal, `environmentVariables`, launching `claude-bin.exe`. **Still open:** the Ctrl+Esc check on the user's machine (`SETUP.md` section 7) and the in-VS Code check of the new commands | – |
| **B** ✅ done (B1 + B2, branches `pkg-b1-sessions`, `pkg-b2-finish`; the Activity Bar tree was replaced by the drawer in Fix 1). **Not built:** conversation rewind and "both" (CLI message never captured), a "move to background" button (no CLI request). Unverified in real VS Code | Sessions: Activity Bar, filters, rename, Ctrl+Shift+T, colour dots, Checkpoints, background + tasks, `/diff` **(with the shared diff-view module that F reuses)**, `/loop` indicator, **agent cards, Claude's pinned task list** (both start with a check that the local model uses sub-agents / `TaskCreate`) | A |
| **C** 🟡 partly done (branch `pkg-c-prompt-box`; `@` absolute paths F-4, `/plan` notice F-5 and local commands in the `/` menu F-13 fixed 2026-11-05). **Not built: `/btw`. LaTeX (bundled KaTeX) built 2026-11-05, unverified in real VS Code.** Unverified in real VS Code | Prompt box: Auto, grouped `/` menu **(with terminal-only commands greyed out)**, @-mentions, **Alt+K (`@path`)**, images, message queue **(visible, cancellable)** **+ per-conversation prompt history**, copy, `/btw`, plan in the editor | A |
| **D** ✅ done (branch `pkg-d-models`; F-8/F-9 fixed 2026-11-05 through `--settings`). **Still open:** the user's checks `dev/check-context-window.txt` and `dev/check-model-switch.txt` on CLI 2.1.246 | Model picker, context meter **(starts by confirming the 64,000 window for `qwen3.8:27b` with `/api/ps`)**, **removing the cost from the result line (tokens-only usage line)**, filtering, restart with `--resume` | A, C |
| **E** ✅ done 2026-11-01 (branch `pkg-e-mcp`) | MCP, sign-in error card, URI (the usage line moved to D). **Still open:** nothing run in real VS Code; `claude mcp add -e` argument order and the live `mcp_status` shape unverified against the real CLI | A |
| **F** 🟡 built 2026-11-08 (chips, Alt+K lines, per-block diff with CodeLens or a QuickPick when `diffEditor.codeLens` is off, autosave, settings; **IDE server with lock file built 2026-11-08**, section 7; unit tests only, nothing in real VS Code). **Open:** the user runs `dev/check-ide-server.ps1` to settle the IDE token header and method names; `openDiff` not built | Editor context (chips or IDE server), **Alt+K selected lines**, per-block diff (**reuses B's diff-view module**), autosave | A, B, IDE prototype |
| **G** ✅ done (branch `pkg-g-display`). **Not built from it:** collapsing long user messages (now package H). Screen reader support was dropped from the plan on 2026-11-06. Browser and real VS Code unverified | Display (Focus view, timestamps, reduced motion, colour mode) | – |
| **H** ✅ built 2026-11-05 (all three; unverified in real VS Code). **Name clash:** the code-navigation server (row below) is also called H | **Retry after an error** (a "נסה שוב" button, click only), **working-file button** (shows the open file, opens a picker), **collapsing long user messages** (display only, setting `claudeLocal.collapseUserMessageLines`) | A (retry: D's error card, E; working-file: C, F's chips; collapse: G) |
| **I** 🟡 step 3 built 2026-11-05 (explorer, file or folder, the agreed instructions); step 2 depends on the user's `dev/check-at-mention.txt`; steps 4-5 (docs, Opus review) partly done | **File/folder source button.** Steps: (1) the user runs `dev/check-at-mention.txt` on their CLI (its PowerShell bug `-replace '\\','/'` was fixed 2026-11-05); (2) only if the CLI does not expand `@path` in stream-json: the extension expands it itself, **Opus 5.5** (stream-json handling); (3) replace the QuickPick in `src/panels/work-file.js` with the project's file explorer, accept folders, new prompts above, **Sonnet 5.5**; (4) docs (`CHANGELOG`, `AGENT_CONTEXT`), **Haiku 5.5**; (5) review before merge, **Opus 5.5** | H (working-file button), C (`@`) |
| **Fix list** | `FIXES.md`. Done: F-1 to F-5, F-7 to F-16 (F-6 and the new drop and rewind button unverified in real VS Code). Open: nothing but the user checks (F-17 left test 2.4 and a repeat of 7.1) | – |
| **H** (**Name clash:** the retry / working-file / collapse package (row above) is also called H.) (all eight tools built 2026-11-05/06; awaiting manual checks (c), (d), (e) in VS Code) | Code-navigation MCP server for JS/React (section 8): a small prototype first (three tools, with a token measurement), then the rest of the tools | A, E (MCP handling); independent of F |

## 6. What is open

1. **IDE server built 2026-11-08** (`src/ide/`, section 7); still unverified against the real CLI: run `dev/check-ide-server.ps1` with `claudeLocal.ideServerVerboseLog` on. History: the IDE server prototype (me). Until then the editor context falls back to chips (**chips built 2026-11-08**; first step for the server: the user runs the read-only `dev/check-ide.txt`, which shows whether the CLI needs a lock file and its fields). Tip: if you ever have a machine with the official Claude Code extension, copy one `.lock` file from `%USERPROFILE%\.claude\ide\`; it shows the exact format of the lock file (on this machine the folder does not exist).
2. Direct confirmation of 64,000 for `qwen3.8:27b` with `/api/ps` while it is loaded (a window of at least 50,000 was measured, so it is not blocking). **Scheduled at the start of package D** (decided 2026-11-01). Package D built the user-run check file `dev/check-context-window.txt`; still open until the user runs it. If windows differ between models, add a `modelContextWindows` setting. `POST :11435/api/show` is no longer needed for vision (images are not gated by model) and stays a non-blocking check for tools capability.
3. The plan-approval buttons: check at the end.
4. Check the following versions inside VS Code 1.91.1 after every package, and update `spec.md`, `PROJECT_MAP.md`, `CHANGELOG.md`, `AGENT_CONTEXT.md` at the end of every package.
5. When updating `spec.md` at the end of each package: also update the "Settings", "Placement" and "History" sections and "Verification status" according to what was built.
6. ~~Cost removal and the mid-turn model switch~~ **Resolved 2026-11-01:** tokens only; the picker is disabled mid-turn with a "stop and switch" button and a detailed Hebrew explanation (see stage 5 and stage 8).
7. ~~Defaults marked ⚠️ in section 4~~ **Approved 2026-11-01** as proposed. Package A is unblocked.
8. ~~Retry after an error~~ **Built 2026-11-05:** button only; shown on every error result.
9. ~~IDE lock file~~ **Decided by the user 2026-11-08:** a temporary lock file with cleanup, recorded in `DECISIONS.md`; reading the CLI 2.1.246 binary showed no file-less route (an environment variable only triggers auto-connect). Original note: **IDE lock file vs "the extension writes no files":** deliberately left open until the IDE server work starts (package F). When it does: first test whether an environment variable or `--ide` is enough with no file; otherwise a temporary lock file with cleanup (delete on deactivate, delete stale locks whose pid is dead), recorded as an explicit exception in `DECISIONS.md`.
10. **Code navigation (decided 2026-11-05), checks for the prototype** (check (a) ran 2026-11-05 on the user's other machine against the real CLI 2.1.246 (`dev/run-h-checks.ps1`): http PASS and stdio PASS, the model called `ping` and returned the nonce (reported by the user; report file not in the repo); check (c) token part: baseline 22,054 input tokens, not clean because the baseline prompt differed, re-measure; prototype built 2026-11-05 with unit tests only, still unverified: inline `--mcp-config` on the real CLI, the tools in VS Code, model choice): (a) that the CLI shows our MCP server's tools to the model when passed with `--mcp-config`, and which transport it accepts (localhost HTTP is the plan; stdio through a helper script is the alternative); (b) the token cost of the tool list, measured with the context meter before and after; (c) that the local model actually chooses `readSymbol` / `documentSymbols` over reading whole files; (d) whether a `jsconfig.json` improves cross-file results in React projects; (e) accuracy of `findImporters` and the reliability of `callHierarchy` in dynamic JS. **Results 2026-11-06 (real VS Code 1.91.1 code, VSCodium on Linux, `dev/nav-check`):** (d) without `jsconfig.json` the TypeScript server only knows open files and their imports (cross-file references were missing; a `.jsx` import of a closed file did not resolve); the tools now open the files that mention the name and resolve such imports themselves, so all 37 checks pass with and without `jsconfig.json`; a `jsconfig.json` is no longer needed for correct answers. (e) `findImporters` rebuilt (see the table in section 8): 8 of 8 importers, the same-named decoy module and a commented-out import excluded; `callHierarchy` incoming finds a caller through CommonJS `require` (added via the definition provider), a call by computed name (`m[name]()`) cannot be found by any static tool. Still open: (b) token cost and (c) model choice against the real CLI and model, and one run on Windows VS Code. Model for package H: ✅ approved 2026-11-05: Opus 5.5 for the hand-written MCP protocol part, Sonnet 5.5 for the tool functions. The checks are run with one script, `dev/run-h-checks.ps1` (PowerShell; covers (a), (b) and the token part of (c); (c) model choice, (d) and (e) need VS Code).
11. **Skipped by the user on 2026-11-05, deliberately left open (do not decide without asking):** (a) retry after an error: automatic or button only, and which error types show the button (stage 1 table, item 8); (b) working-file button: what happens after a file is chosen, shown on the button only or attached to the next message or to every message (stage 3 table); (c) the "move to background" button, which the CLI cannot support (stage 4 table, `DECISIONS.md`): drop it or keep it as a future item; (d) the length at which long user messages collapse (stage 6 table, proposed 8 lines). **Merge note (2026-11-08):** the other line of work records the same retry, working-file button, collapse and background-button questions as settled and built (package H, "retry / working-file / collapse", see "Package H" in section 5 and `CHANGELOG.md` 2026-11-05); the two records contradict each other, so ask the user before relying on either.
12. **MCP bridging (decided 2026-11-05), checks:** that the CLI sends MCP prompts to the extension in stream-json mode (in the `initialize` response or elsewhere) and under what names; that `mcp_status` gives each server's tool names and descriptions; that `mcp_toggle` is session-only and writes nothing to the CLI configuration. Nothing here has been run against the real CLI.
13. **`@path` expansion in stream-json mode** (package I, step 1): unverified until the user runs `dev/check-at-mention.txt` on their CLI (the file's PowerShell bug was fixed 2026-11-05; if `claude` is not on PATH, set `$claude` to its full path). The result decides whether package I step 2 (the extension expands `@path` itself) is needed.

## 7. IDE server: design notes

Kept from the old plan (M2/M4) before it was deleted. This is an **initial design only**; the real protocol was not checked (see section 6, item 1), so **first capture the real format and messages from the CLI** (lock file, `initialize`, `mcp_message`) and only then write code. If the messages differ from what is written here, update this document to match reality.
- **Server:** WebSocket on `127.0.0.1` on a random port, with an authentication header. An RFC 6455 frame codec written by hand (no npm packages, no build).
- **Lock file:** written to `~/.claude/ide` so that the CLI's `/ide` and `--ide` recognize the IDE (`CLAUDE_CONFIG_DIR` is taken into account). This conflicts with the rule "the extension writes no files" only to the extent that the file is a temporary per-process lock file; this must be decided before building, and the file cleaned up on close.
- **Tools the server exposes:** `getDiagnostics` and `getOpenEditors` (through `mcp_message`), `openFile`, `openDiff` (uses package F's diff view) and `selection_changed` (editor context). `executeCode` (Jupyter): no.
- **Fallback:** if the CLI does not connect, the editor context stays as chips above the box (section 2, stage 3).
- **Tests:** unit tests for the codec and the frames (`ws-frames`), and a manual check that `/ide` recognizes the server.
- **Built 2026-11-08 (first step):** `src/ide/` (`ws-frames`, `ws-server`, `ide-rpc`, `ide-lock`, `ide-service`, `ide-vscode`, `index`); the lock file was decided (section 6 item 9). Verified from the CLI 2.1.246 binary: lock discovery in `<config dir>/ide/*.lock`, its fields, port from the file name, client type `ws-ide`, auto-connect on `CLAUDE_CODE_SSE_PORT`. **Guessed, logged to be checked:** the token header (`x-claude-code-ide-authorization`, `Authorization` also accepted), subprotocol `mcp`, tool and notification names. `openDiff` is not built (its accept/reject wait does not fall out of the diff view cheaply). Tests `ws-frames.test.js`, `ide-server.test.js`; user check `dev/check-ide-server.ps1`.
10. **Synced with `spec.md` "Verification status" (2026-11-05):** nothing is verified inside real VS Code 1.91.1 (Fix 1, F-4 to F-7, packages A to G); the unit tests were not run after Fix 1's 138/138 (no Node on the dev machine: run `node --test "test/*.test.js"` in PowerShell); F-8/F-9 were verified only on CLI 2.1.317, so the user still runs `dev/check-model-switch.txt` on 2.1.246; `scripts/package.ps1` (packaging) is not built.
11. **Package H (retry, working-file button, collapsing long messages)** was built 2026-11-05 after the user confirmed the open questions; nothing in it is verified in real VS Code.

## 8. Code navigation MCP server: design (decided 2026-11-05)

**Goal:** let Claude find and move around JS/React code by meaning (symbols, definitions, references) instead of only by text search, with small answers for the 64,000-token window.

**Delivery:** the extension starts a small MCP server on `127.0.0.1` (random port, random token required in a header; hand-written JSON-RPC, no npm, no build) and passes it to the CLI with `--mcp-config`. It needs no lock file, so it does not touch the "the extension writes no files" rule. The IDE server (section 7) is separate and stays for editor context and `openDiff`. Both can exist side by side.

**Tools** (each is one function registered in a list; `tools/list` is built from the list):
| Tool | VS Code API | Returns |
|---|---|---|
| `findReferences` | `vscode.executeReferenceProvider` | Locations grouped by file, one line of source each |
| `goToDefinition` | `vscode.executeDefinitionProvider` (+ type definition, implementation) | Location plus a few lines of the declaration |
| `documentSymbols` | `vscode.executeDocumentSymbolProvider` | File outline (names, kinds, line ranges) |
| `workspaceSymbols` | `vscode.executeWorkspaceSymbolProvider` | Matches by name across the workspace |
| `hover` | `vscode.executeHoverProvider` | Type, signature, doc text (limited value in JS without TypeScript) |
| `callHierarchy` (later) | `vscode.prepareCallHierarchy`, `vscode.provideIncomingCalls`, `vscode.provideOutgoingCalls` | Callers and callees; less reliable in dynamic JS |
| `readSymbol` | `documentSymbols` ranges + reading the file | The exact source of one function, component or class, not the whole file |
| `findImporters` | Text search for `from`/`import`/`import()`/`require` lines, each specifier resolved to the file (relative: Node rules; bare/alias: `vscode.executeDefinitionProvider` on the module string). Changed 2026-11-06: the first design (references of one export name) found 1 of 8 importers in real VS Code | Which files import a module |

`getDiagnostics` stays with the IDE server (section 2, stage 5). `documentSymbols` and `workspaceSymbols` take a `kind` filter (function, class, variable, component-like) to keep answers small.

**Design rules:**
- **Input by name:** `file` + `symbol` (optional `line`) instead of line and column, because a local model gets positions wrong; the tool resolves the name through `documentSymbols` or a text match on that line.
- **Size caps:** at most 50 results and 2,000 characters per answer, ending with "N more not shown". The numbers can be adjusted after real use.
- **Permissions (decided 2026-11-05):** the extension passes `--allowedTools` for our own server only (the navigation tools are read-only), so no approval card appears per call. Other MCP servers still ask.
- **Path limit (decided 2026-11-05):** a tool that receives a file path answers "no access" for any path outside the open workspace folders.
- **Plain failure:** when a language has no provider (for example `.cs` files), the tool says so and Claude falls back to `Grep`.
- **Token cost:** the tool list is sent with every request; keep descriptions short and parameters few (merge tools if it gets large). Measured in the prototype (section 6, item 10).
- **Tests:** unit tests for the pure parts (result shaping, caps, name-to-position, the JSON-RPC handling) with fake provider results; a manual check in real VS Code.

**Not decided here (in `FUTURE_FEATURES.md`):** navigation results as clickable cards in the chat, a repository map, "open at symbol", rename/refactor, and all .NET work.

**First step (✅ approved 2026-11-05, starts after the checks in section 6 item 10 have results; the user asked on 2026-11-05 whether it depends on the rest of the plan: it depends only on packages A and E, which are done, not on F):** a prototype with three tools (`documentSymbols`, `readSymbol`, `findReferences`) to check items (a)-(c) above before building the rest.
