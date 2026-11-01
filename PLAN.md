# Plan: every decision and its reason

Updated: 2026-11-01. This is the **single source of truth for what to build next**. The old historical log (`features-plan.md`) was merged into this file and `DEPENDENCIES.md` and deleted; `DECISIONS.md` holds the architecture-level decisions in full format (alternatives and reasons). What exists today is described in `spec.md`; the measured facts behind the decisions are in `DEPENDENCIES.md`.

**Source of each decision:** 👤 the user decided (question and answer) · ✅ a recommendation the user approved · 🔧 derived from a check against the CLI/gateway (a factual reason) · ⚠️ my adjustment that was not asked explicitly (awaiting approval).

## 1. Base facts that affect everything

| Fact | Value | Source |
|---|---|---|
| Environment | A machine that will end up without internet; local model `qwen3.8:27b` through the LiteLLM 1.80.0 gateway (`172.27.5.5:11436`) over Ollama (`:11435`) | `SETUP.md`, checks |
| The CLI | Claude Code 2.1.246 (`claude-bin.exe`) | checks |
| VS Code | 1.91.1 (no secondary side bar; every API must fit) | checks |
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
| Images and files | **Paste images, drag files (Shift), PDF and LaTeX.** **No control by model:** images are always accepted, with no `visionModels` setting, no warning and no blocking (decided 2026-11-01) | Vision was verified only on `qwen3.8:27b`; gateway capability flags are unreliable and `/api/show` is not exposed. The earlier requirement to hide/disable images for models without vision is **dropped**; PDF is read by the CLI (needs poppler); LaTeX needs a bundled KaTeX | 👤 + 🔧 |
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
| MCP | **A full management dialog, including add and remove from the UI** (list + status, enable/disable, reconnect). OAuth: no | Verified: `mcp_status`, `mcp_reconnect`, `mcp_toggle` work, and so do `claude mcp add/remove` | 👤 + 🔧 |
| Plugins and Mods | **Skip** | Marketplaces on GitHub, does not work offline | 👤 |
| Git | **No change** (through Bash); no PR status | Already works, and the status needs GitHub | 👤 |
| Session usage line | **Tokens only, no cost.** A full `/usage` dialog: no. Git status in the box line: no. **Separate from the context meter**: the meter (package D) shows the window fill now ("הקשר: 23,400 / 64,000"); the usage line shows the last turn ("תור: קלט · פלט"). **Removing the cost is done in package D** (one line in the existing result line), not in E (decided 2026-11-01) | The cost the CLI reports is meaningless (`costBasis: unknown`), and nothing costs money here. The two components come from different sources (`get_context_usage` vs the `result` message) | 👤 + 🔧 |

### Stage 6: display, accessibility, settings, shortcuts

| Feature | Decision | Reason | Source |
|---|---|---|---|
| Display | **Focus view, timestamps, `spinnerVerbs`, `scrollToBottomOnSend`** | All chosen; light and independent | 👤 |
| `useTerminal` | **A setting** that makes the main button open a terminal | Chosen | 👤 |
| Accessibility | **Accessibility and colour settings** (`prefersReducedMotion`, daltonized) + **screen-reader announcements, speaker labels ("אתה"/"Claude") and navigation by headings** | Chosen; testing needs a real screen reader | 👤 |
| More settings | **`enableNewConversationShortcut` (Ctrl+N), `environmentVariables`** | Chosen | 👤 |
| `claudeProcessWrapper`, `usePythonEnvironment`, `enableReopenClosedSessionShortcut`, `disableLoginPrompt` | **No** | Not needed (a wrapper is possible in the future; no login; Ctrl+Shift+T is already decided) | 👤 |
| Shortcuts | **Ctrl+Esc** (editor↔chat) + **Ctrl+Alt+C** to open in a new tab (Ctrl+Shift+Esc stays). **Ctrl+Esc is kept, with a check on the user's machine in package A**: on Windows it normally opens the Start menu; if it does, replace it with another key (decided 2026-11-01) | Ctrl+Shift+Esc is taken by Windows Task Manager | 👤 |
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
| Message queue, Ctrl+Enter, prompt history (up arrow) | **Yes**, in memory only. **A visible queue** (grey bubbles marked "ממתין" with a cancel button, using `interrupt_cancel_queued_v1`) and **history per conversation** (up arrow browses that conversation's sent messages only). Package C (decided 2026-11-01) | Verified: a message mid-turn is accepted and handled after the first. Cancelling matters with a slow cold-loading model | 👤 + 🔧 |
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
| 4 | **Model switch: restart the process** with `--model <id>`, the three `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` and `--resume` | `set_model` at run time is always accepted without validation and the error arrives only in the next turn; choosing at start-up was verified and works (`gemma4:26b`). The session title is created by a call to the HAIKU model, so without changing it the server loads two models (cold load = 285 seconds) |
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

**VS Code-level keyboard shortcuts** are not settings but `contributes.keybindings`: Ctrl+Shift+Esc and Ctrl+Alt+C (existing), Ctrl+Esc, Ctrl+Shift+T, Alt+K and more.

## 5. Build order

**Models are mandatory (see `AGENT_CONTEXT.md`, "Models: mandatory"): Sonnet 5.5 for packages A, C, E, G and the simple parts of B; Opus 5.5 for the protocol-sensitive parts of B, for D's restart/`--resume`, for F, and for review. Fable is not used; Opus is the maximum.**

| Package | Content | Depends on |
|---|---|---|
| **A** | Settings, rebindable shortcuts **(including Ctrl+Esc, tested on the user's machine for the Start-menu conflict)**, Open in Terminal, `environmentVariables`, launching `claude-bin.exe` | – |
| **B** | Sessions: Activity Bar, filters, rename, Ctrl+Shift+T, colour dots, Checkpoints, background + tasks, `/diff` **(with the shared diff-view module that F reuses)**, `/loop` indicator, **agent cards, Claude's pinned task list** (both start with a check that the local model uses sub-agents / `TaskCreate`) | A |
| **C** | Prompt box: Auto, grouped `/` menu **(with terminal-only commands greyed out)**, @-mentions, **Alt+K (`@path`)**, images, message queue **(visible, cancellable)** **+ per-conversation prompt history**, copy, `/btw`, plan in the editor | A |
| **D** | Model picker, context meter **(starts by confirming the 64,000 window for `qwen3.8:27b` with `/api/ps`)**, **removing the cost from the result line (tokens-only usage line)**, filtering, restart with `--resume` | A, C |
| **E** | MCP, sign-in error card, URI (the usage line moved to D) | A |
| **F** | Editor context (chips or IDE server), **Alt+K selected lines**, per-block diff (**reuses B's diff-view module**), autosave | A, B, IDE prototype |
| **G** | Display and accessibility (Focus view, timestamps, screen reader) | – |

## 6. What is open

1. The IDE server prototype (me). Until then the editor context falls back to chips. Tip: if you ever have a machine with the official Claude Code extension, copy one `.lock` file from `%USERPROFILE%\.claude\ide\`; it shows the exact format of the lock file (on this machine the folder does not exist).
2. Direct confirmation of 64,000 for `qwen3.8:27b` with `/api/ps` while it is loaded (a window of at least 50,000 was measured, so it is not blocking). **Scheduled at the start of package D** (decided 2026-11-01). If windows differ between models, add a `modelContextWindows` setting. `POST :11435/api/show` is no longer needed for vision (images are not gated by model) and stays a non-blocking check for tools capability.
3. The plan-approval buttons: check at the end.
4. Check the following versions inside VS Code 1.91.1 after every package, and update `spec.md`, `PROJECT_MAP.md`, `CHANGELOG.md`, `AGENT_CONTEXT.md` at the end of every package.
5. When updating `spec.md` at the end of each package: also update the "Settings", "Placement" and "History" sections and "Verification status" according to what was built.
6. ~~Cost removal and the mid-turn model switch~~ **Resolved 2026-11-01:** tokens only; the picker is disabled mid-turn with a "stop and switch" button and a detailed Hebrew explanation (see stage 5 and stage 8).
7. ~~Defaults marked ⚠️ in section 4~~ **Approved 2026-11-01** as proposed. Package A is unblocked.
8. **IDE lock file vs "the extension writes no files":** deliberately left open until the IDE server work starts (package F). When it does: first test whether an environment variable or `--ide` is enough with no file; otherwise a temporary lock file with cleanup (delete on deactivate, delete stale locks whose pid is dead), recorded as an explicit exception in `DECISIONS.md`.

## 7. IDE server: design notes

Kept from the old plan (M2/M4) before it was deleted. This is an **initial design only**; the real protocol was not checked (see section 6, item 1), so **first capture the real format and messages from the CLI** (lock file, `initialize`, `mcp_message`) and only then write code. If the messages differ from what is written here, update this document to match reality.
- **Server:** WebSocket on `127.0.0.1` on a random port, with an authentication header. An RFC 6455 frame codec written by hand (no npm packages, no build).
- **Lock file:** written to `~/.claude/ide` so that the CLI's `/ide` and `--ide` recognize the IDE (`CLAUDE_CONFIG_DIR` is taken into account). This conflicts with the rule "the extension writes no files" only to the extent that the file is a temporary per-process lock file; this must be decided before building, and the file cleaned up on close.
- **Tools the server exposes:** `getDiagnostics` and `getOpenEditors` (through `mcp_message`), `openFile`, `openDiff` (uses package F's diff view) and `selection_changed` (editor context). `executeCode` (Jupyter): no.
- **Fallback:** if the CLI does not connect, the editor context stays as chips above the box (section 2, stage 3).
- **Tests:** unit tests for the codec and the frames (`ws-frames`), and a manual check that `/ide` recognizes the server.
