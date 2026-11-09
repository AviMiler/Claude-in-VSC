# Future features: ideas not yet in the plan

A **parking place for ideas**: nothing here is decided, scheduled or built. Each idea is reviewed with the user one by one; an approved idea moves into `PLAN.md` and is removed from here. Rejected ideas stay, marked, so they are not proposed again.

**Status values:** 💡 idea, not discussed · 🗣️ discussed, open questions · ✅ approved, move to `PLAN.md` · ❌ rejected.

## 1. Code navigation for Claude (requested 2026-11-05)

**Moved to `PLAN.md` 2026-11-05 (approved):** the approach, tools, design rules and delivery (an MCP server of our own); `PLAN.md` section 8 and stage 5. Scope there: JavaScript and React only.

**Still here (not yet reviewed):**

### 1.1 Navigation results shown in the chat — ✅ approved 2026-11-08, built 2026-11-09 (`PLAN.md` section 9)
The chat renders a navigation call as a compact Hebrew card ("מקומות שימוש של X: 12 תוצאות") whose lines open the file at that line in the editor. Gives the user the same view Claude has. Open: whether the chat already makes `path:line` clickable.

### 1.2 Other helpers — repository map stays 💡 (decided 2026-11-08: waits for a stronger model with the servers installed); "open at symbol" ✅ built 2026-11-09 as an explicit "פתיחה בעורך" button on tool rows (changed from the earlier setting, off by default; not a model tool, a tool would grow the context; `PLAN.md` section 9)
- **Repository map:** one call that returns folders plus the top-level symbols per file, so Claude can orient itself cheaply. Open: worth a tool, given that `Glob` and `documentSymbols` exist?
- **Open at symbol:** `openFile` that jumps to a symbol, so the user sees what Claude is looking at.

### 1.3 Considered and left out — reviewed 2026-11-08: rename/refactor stays open until after the navigation checks; `signatureHelp` waits for a stronger model; MCP resources through `@` (section 3.3) stay open until `dev/check-at-mention.txt` is run
- **Rename / refactor through providers** (`vscode.executeDocumentRenameProvider`): edits must go through the per-block approval flow of package F, so this is not proposed.
- **`signatureHelp`:** overlaps `hover`; skipped on 2026-11-05.

## 2. .NET support (requested 2026-11-05)

**Background:** the user works in JS/React and in C# on .NET 6. JS/React navigation works in VS Code (`PLAN.md` section 8); C# has none because no C# extension is installed, and the .NET work is probably done in Visual Studio 2022. Depends on the extension (the core), after the base packages. Nothing decided. Constraint: no internet (`AGENT_CONTEXT.md`); files can be brought in, no network installs.

### 2.1 Option A: C# navigation inside VS Code through a C# extension — 💡
- Bring a C# extension in as a `.vsix` file and install it by hand ("Install from VSIX"). Candidate: the open-source community build `muhammad-sammy.csharp` from open-vsx.org (from memory, **not verified**). The Microsoft C# extension is another candidate; C# Dev Kit is not suitable (licence and sign-in).
- Once it works, the navigation tools in `PLAN.md` section 8 (`findReferences`, `goToDefinition`, and so on) cover `.cs` files with **no work on our side**, because they use VS Code's providers.
- **To check before relying on it:** that the version is compatible with VS Code 1.91.1; that the file bundles its language-server binaries (a platform-specific build, for example `win32-x64`) instead of downloading them on first run; that it works with the installed .NET SDK; and the licence terms of the chosen build.
- **Test on the user's machine:** open a .NET project folder and a `.cs` file, then `F12` (go to definition), `Shift+F12` (find all references), hover. Send the C# / OmniSharp log from the Output panel if it fails.
- Cost to us: almost none (documentation and a check). Cost to the user: one file brought in and installed by hand.

### 2.2 Option B: port the extension to Visual Studio 2022 — 💡 (large, far future)
- **What it means:** a new, separate product, not a conversion: a Visual Studio extension (VSIX, C# with the Visual Studio SDK) is a different technology, so most would be rewritten. A port plan exists: `vs2022/PLAN.md`.
- **What could be reused:** the knowledge of the CLI protocol (`stream-json`, control messages, `DEPENDENCIES.md`) and, probably, the chat UI in `webview/` (HTML/JS/CSS), hosted in a WebView2 control. The hosting itself is **unverified**.
- **What would not carry over:** everything under `src/` that uses the VS Code API (panels, commands, settings, diff view, mentions, history).
- **What Visual Studio would give:** Roslyn-based C# navigation natively (go to definition, references, symbols) through the Visual Studio SDK, without an extra extension.
- **Conflicts with the project's principles and the no-internet rule:**
  - The principle "plain JS, no build, no npm" does not hold; this needs a C# project and a build.
  - Building needs the Visual Studio SDK workload and NuGet packages. Without internet they would have to be brought in as files (an exception under the library rule). **Unknown** whether this is practical.
  - Two products to maintain.
- **Cheaper middle ground to consider first:** keep working in VS Code for AI work and use Option A for navigation, leaving Visual Studio for building and debugging.
- **Questions for the user:** is the goal to have Claude inside Visual Studio itself, or only to have C# navigation for Claude? If the second, Option A is enough.

### 2.3 Option C: do nothing for C# — 💡
Claude keeps using `Grep`, `Glob` and `Read` on `.cs` files, as today.

### 2.4 Open questions
1. Is C# worth any effort now, or does it wait until the JS tools (`PLAN.md` section 8) are built?
2. If A: can the user bring in a `.vsix` and run the F12 check?
3. If B: is the goal Claude inside Visual Studio, or only C# navigation?

## 3. MCP bridging: use and per-session on/off only (requested 2026-11-05)

**Principle (user, 2026-11-05):** the extension is only a **bridge** to the CLI. It gives access to **using** MCP servers and to **turning them on or off in a session**. It does **not** edit MCP configuration. (Earlier in the same conversation the user asked for "everything the CLI has, bridged"; the user then withdrew the editing part.)

### 3.1 What already exists (package E, `src/mcp/`) — for reference
- A dialog that lists the servers with their status, enable/disable (`mcp_toggle`), reconnect (`mcp_reconnect`), and **add/remove** through `claude mcp add/remove`. Verified only by unit tests, not in real VS Code.
- The CLI loads the servers from its own configuration; the extension stores nothing.

### 3.2 Conflict with the new principle — ✅ decided 2026-11-05: keep add/remove as it is (option B); no new editing features are added
- **Add/remove** is editing, so it conflicts with "use and on/off only". Options: (A) remove the add/remove buttons from the dialog and keep list, status, enable/disable and reconnect; (B) keep add/remove as it is; (C) hide them behind a setting. Not decided. The `PLAN.md` stage 5 row ("A full management dialog, including add and remove from the UI") would change accordingly.

### 3.3 Candidate bridging of **using** MCP — reviewed 2026-11-05: the tool list (read-only), prompts as slash commands and the per-session on/off check are ✅ **moved to `PLAN.md`** (stage 5 MCP row, section 6 item 12); **resources through `@` were not chosen and stay 💡** (none verified against the real CLI)
- **Tools of each server, read-only:** show a server's tool list in the dialog (the `mcp_status` response already carries a tool list, `DEPENDENCIES.md` row 15). Permission cards for MCP tool calls already work through `can_use_tool`.
- **Prompts as slash commands:** MCP prompts are exposed by the CLI as slash commands; they should appear in the grouped `/` menu. Unverified whether they arrive in the `initialize` response in stream-json mode.
- **Resources through `@`:** attach an MCP resource from a server with `@`. Unverified: the `@path` text is not expanded by the CLI in stream-json mode (`FIXES.md` F-4), so a resource mention probably needs the extension to fetch it some other way, which may not be possible as a pure bridge.
- **Per-session on/off:** exists (`mcp_toggle`); "per session" means it applies to the running conversation and is not saved. To check: that a toggle is not written to the CLI's configuration.
- **Our own server for package H** (`PLAN.md` section 8) is passed per launch with `--mcp-config`. It is not editing: nothing is stored.

## 4. Small context, speed and focus for the weak local model (requested 2026-11-09)

The user's three problems: (1) the context window is small (64,000; local qwen3.8:27b through LiteLLM over Ollama), so context must stay minimal and precise; (2) execution is very slow, so the model must reach what it needs in few steps; (3) the model is weak, so it must be kept focused. Guiding idea: give the model less, and exactly what it needs. All items are 💡 (not yet decided).

### 4.1 Context

- **4.1a Lean mode — 💡 (needs a check first):** launch the CLI with only the needed tools (`--tools`, already used by `/btw`); drop WebFetch, WebSearch, NotebookEdit, Task, Todo etc. Every tool's schema is sent each turn. Check: measure with the usage gauge before/after.
- **4.1b Short system prompt for a weak model — 💡 (needs a check first):** `--system-prompt` replacing Claude Code's long one. Check: the flag works on CLI 2.1.246.
- **4.1c Cap tool output size — 💡 (needs a check first):** Bash and MCP output limits through the CLI's environment variables, so one huge output cannot flood the context. Check: exact variable names on 2.1.246.
- **4.1d Context "X-ray" in the usage gauge — 💡:** show which messages and tool results take the most tokens. No prior check needed.
- **4.1e "New task, new conversation" — 💡:** a button that summarizes the conversation in a few lines and opens a clean conversation with the summary. No prior check needed.
- **4.1f Short project-instructions template (CLAUDE.md) — 💡:** every line is sent with each message, so keep it short. Docs only.

### 4.2 Speed

- **4.2a Keep the model loaded — 💡:** cold load takes 285 s and the model is unloaded after ~5 min. Set `keep_alive` without limit in the gateway/Ollama config, or send a small periodic ping from the extension. Probably the biggest time saving.
- **4.2b Stable prefix — 💡 (needs a check first):** Ollama can reuse the cached prefix computation if the system prompt and tools do not change between messages, dynamic context (chips, selection) goes at the end of the message, and the window size stays constant. Check: confirm today's behavior.
- **4.2c Attach a symbol with its context — 💡:** a button/Alt+K on a function attaches its definition plus its callers, saving 3-4 search calls.
- **4.2d Repository map — 💡:** already in section 1.2; stronger rationale now: one call returns the project structure instead of chains of Glob/Grep.
- **4.2e "Problems in file" tool — 💡:** in our navigation MCP server (`vscode.languages.getDiagnostics`), so the model sees the editor's errors without running a build. *Evidence 2026-11-09:* the official extension feeds diagnostics to the model through SDK hooks around Edit (`DEPENDENCIES.md` row 42).

### 4.3 Focus

- **4.3a Recipes as commands — 💡:** e.g. `/fix-bug`, `/add-test`, each giving the model a short step-by-step procedure.
- **4.3b Plan, then one step at a time — 💡:** plan in plan mode, then run each step in a fresh conversation containing only the plan.
- **4.3c Fewer tools, fewer wrong tool choices — 💡:** same as 4.1a.
- **4.3d Edit-by-symbol-name tool — 💡 (needs a user decision):** replace a function body by name instead of Edit's exact `old_string` match, which weak models often fail. Decision: an edit through MCP bypasses the per-block approval flow (package F). See also the rename/refactor note in 1.3.
- **4.3e Automatic feedback after an edit — 💡:** the editor's diagnostics for the edited file go back to the model automatically. *Evidence 2026-11-09:* the official extension does this (baseline diagnostics captured before Edit, new ones after; `DEPENDENCIES.md` row 42); new candidate, via SDK hooks, pending the user's decision. *Per-file count 2026-11-09:* the official `extension.js` itself contains getDiagnostics/openDiff/mcp_message/claude-vscode, so it implements them through its `claude-vscode` SDK MCP server. Two ways for us: (1) like the official one, an SDK MCP server plus hooks around Edit (protocol unverified on CLI 2.1.246); (2) recommended: a "problems in file" tool in our nav MCP server (4.2e) and, after each edit, the new diagnostics sent as an English text block before the next message (channels that already work). Pending the user.
- **4.3f Instructions in English — 💡:** Hebrew costs 2-3x the tokens and local models follow English instructions better; the UI stays Hebrew, model-facing instructions are English.

### 4.4 Recommended order (proposed to the user, not yet approved)

1. Measure: 4.1a and 4.1d.
2. Big and simple: 4.2a, 4.1c, 4.1b.
3. Focus: 4.2e with 4.3e, then 4.3a, 4.2c.

Open question for the user: which of these to move to `PLAN.md`.
