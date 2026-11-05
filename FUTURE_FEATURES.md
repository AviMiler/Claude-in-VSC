# Future features: ideas not yet in the plan

This is a **parking place for ideas**. Nothing here is decided, scheduled or built. Each idea is reviewed with the user one by one; an approved idea moves into `PLAN.md` (stage table, settings, build order) and is removed from here. Rejected ideas are marked and kept so they are not proposed again.

**Status values:** 💡 idea, not discussed · 🗣️ discussed, open questions · ✅ approved, move to `PLAN.md` · ❌ rejected.

## 1. Code navigation for Claude (requested 2026-11-05)

**Goal:** let Claude find and move around code by meaning (symbols, definitions, references) instead of only by text (`Grep`/`Glob`/`Read`), and keep the answers small, because the real context window is about 64,000 tokens.

### 1.1 Approach: use VS Code's language features, not a language server of our own — ✅ approved 2026-11-05 for JS/React (all .NET work stays in section 2, future)
- VS Code already runs language servers (TypeScript/JavaScript built in; Python, C#, Java and others through extensions) and exposes their results through `vscode.commands.executeCommand('vscode.execute…Provider', …)`. The extension would only translate those results into tool answers.
- Running our own LSP client plus servers would mean shipping and updating servers with no npm and no build, on a machine without internet. Not proposed.
- Limit: a language has navigation only if its VS Code extension is installed on the target machine.
- **The user's languages (2026-11-05):** JavaScript + React (no TypeScript) and C# on .NET 6.
  - JS/JSX: covered by the TypeScript language service built into VS Code; nothing to install. A `jsconfig.json` in the project makes cross-file results more accurate (an assumption to verify).
  - C#: needs a C# extension and the .NET SDK on the machine. **Unknown:** whether one is installed, which one (C# or C# Dev Kit), and whether it works offline. Some versions download language-server components on first use, and VS Code 1.91.1 limits which extension versions can be used. Do not assume it works; check on the machine.
  - **Result of the user's check (2026-11-05):** no extensions are installed in VS Code; JS/React navigation is confirmed to work; C# is probably used only in Visual Studio, not VS Code. So **C# navigation is out of scope for now** (see section 2 for the options): Claude falls back to `Grep`/`Glob`/`Read` on `.cs` files. It could be added later by bringing a C# extension (a file) into the machine, treated as a special case; not planned.
  - Per `AGENT_CONTEXT.md` (no internet), the extension must not install anything itself.

### 1.2 Candidate tools — 🗣️ user's choice 2026-11-05: all four groups below approved for JS/React; extra ideas in 1.2a await review
Approved: (1) `findReferences` + `goToDefinition`; (2) `documentSymbols` + `workspaceSymbols`; (3) `hover`; (4) `callHierarchy` (still a later addition; less reliable in dynamic JS).

| Tool | VS Code API behind it | Returns |
|---|---|---|
| `findReferences` | `vscode.executeReferenceProvider` | Locations grouped by file, one line of source each |
| `goToDefinition` | `vscode.executeDefinitionProvider`, `vscode.executeTypeDefinitionProvider`, `vscode.executeImplementationProvider` | Location plus a few lines of the declaration |
| `hover` | `vscode.executeHoverProvider` | Type, signature, doc text |
| `documentSymbols` | `vscode.executeDocumentSymbolProvider` | File outline (names, kinds, line ranges); far cheaper than reading the file |
| `workspaceSymbols` | `vscode.executeWorkspaceSymbolProvider` | Matches by name across the workspace |
| `callHierarchy` | `vscode.prepareCallHierarchy`, `vscode.provideIncomingCalls`, `vscode.provideOutgoingCalls` | Callers and callees (a later addition) |
| `getDiagnostics` | `vscode.languages.getDiagnostics` | Already in `PLAN.md` (IDE server); listed here only for completeness |

### 1.2a Extra ideas for JS/React (proposed 2026-11-05) — reviewed 2026-11-05: 1, 2, 3 ✅ approved; 4 not chosen (stays 💡); 5 ❌ skipped
1. **`readSymbol`:** returns the exact source of one function, component or class (found through `documentSymbols` ranges) instead of the whole file. Probably the biggest context saver after `documentSymbols`.
2. **`findImporters`:** which files import a given module; built on `findReferences` of the exported name, with a text-search fallback on `import … from` paths. Useful before changing or deleting a file. **Accuracy to verify.**
3. **Symbol kind filter:** `kind` parameter (function, class, variable, component-like) on `workspaceSymbols` and `documentSymbols`, so answers stay small.
4. **Navigation results shown in the chat:** the chat renders a navigation call as a compact Hebrew card ("מקומות שימוש של X: 12 תוצאות") whose lines open the file at that line in the editor. Gives the user the same view Claude has. Open: whether the chat already makes `path:line` clickable.
5. **`signatureHelp`:** parameter list of a function being called (`vscode.executeSignatureHelpProvider`); largely overlaps `hover`, so probably skip.

### 1.3 Design ideas — ✅ approved 2026-11-05 as written (numbers adjustable after real use)
- **Input by name, not position:** `file` + `symbol` (+ optional `line`) instead of raw line/column, because a local model gets positions wrong. The tool resolves the name through `documentSymbols` or a text match on that line.
- **Size caps:** about 50 references and 2,000 characters per answer, ending with "N more not shown".
- **Plain failure:** when a language has no provider, the tool says so, and Claude falls back to `Grep`.
- **Tests:** unit tests for the pure parts (result shaping, caps, name-to-position) with fake provider results; a manual check in real VS Code per language.

### 1.4 Delivery: how the CLI gets the tools — 💡 (needs a prototype)
- **Option A, the IDE server** (`PLAN.md` section 7): register the tools there. Unverified risk: to my knowledge the official extension exposes only a couple of IDE tools to the model, so the CLI may hide extra ones. Not checked on this CLI (2.1.246).
- **Option B, an MCP server of the extension's own:** a small localhost server (hand-written JSON-RPC, no npm) passed to the CLI with `--mcp-config`. Needs no lock file, so it avoids the "the extension writes no files" conflict (`PLAN.md` section 6, item 9).
- Both options reuse the same tool implementations, so the choice can wait for the prototype.

### 1.5 Other helpers worth considering — 💡
- **Repository map:** one call that returns folders plus the top-level symbols per file, so Claude can orient itself cheaply.
- **Open at symbol:** `openFile` that jumps to a symbol, so the user sees what Claude is looking at.

### 1.6 Considered and left out — ❌ (proposed to leave out; user to confirm)
- **Rename / refactor through providers** (`vscode.executeDocumentRenameProvider`): edits must go through the per-block approval flow of package F, so this is not proposed.

### 1.7 Open questions
1. Does the CLI show extra IDE-server tools to the model, or only `getDiagnostics`? (prototype)
2. ~~Which languages?~~ Answered: JS/React works; C# is not available in VS Code (out of scope for now).
3. Is the repository map worth a tool, given that `Glob` and `documentSymbols` already exist?
4. Where in the build order: after package F's IDE prototype, or independent of it (Option B)?

## 2. .NET support (requested 2026-11-05)

**Background:** the user works in JS/React and in C# on .NET 6. In VS Code, JS/React navigation works (section 1); C# has no navigation because no C# extension is installed, and the .NET work is probably done in Visual Studio 2022. **Depends on the extension (the project's core), after the base packages.** Nothing here is decided. Constraint: no internet (`AGENT_CONTEXT.md`); files can be brought in, no network installs.

### 2.1 Option A: C# navigation inside VS Code through a C# extension — 💡
- Bring a C# extension in as a `.vsix` file and install it by hand ("Install from VSIX"). Candidate: the open-source community build `muhammad-sammy.csharp` from open-vsx.org (from memory, **not verified**). The Microsoft C# extension is another candidate; C# Dev Kit is not suitable (licence and sign-in).
- Once it works, section 1's tools (`findReferences`, `goToDefinition`, and so on) cover `.cs` files with **no work on our side**, because they use VS Code's providers.
- **To check before relying on it:** that the version is compatible with VS Code 1.91.1; that the file bundles its language-server binaries (a platform-specific build, for example `win32-x64`) instead of downloading them on first run; that it works with the installed .NET SDK; and the licence terms of the chosen build.
- **Test on the user's machine:** open a .NET project folder and a `.cs` file, then `F12` (go to definition), `Shift+F12` (find all references), hover. Send the C# / OmniSharp log from the Output panel if it fails.
- Cost to us: almost none (documentation and a check). Cost to the user: one file brought in and installed by hand.

### 2.2 Option B: port the extension to Visual Studio 2022 — 💡 (large, far future)
- **What it means:** a new, separate product, not a conversion. A Visual Studio extension is a different technology (a VSIX for Visual Studio, written in C# with the Visual Studio SDK), so the VS Code extension cannot be "converted"; most of it would be rewritten.
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
1. Is C# worth any effort now, or does it wait until the JS tools (section 1) are built?
2. If A: can the user bring in a `.vsix` and run the F12 check?
3. If B: is the goal Claude inside Visual Studio, or only C# navigation?
