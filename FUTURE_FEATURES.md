# Future features: ideas not yet in the plan

This is a **parking place for ideas**. Nothing here is decided, scheduled or built. Each idea is reviewed with the user one by one; an approved idea moves into `PLAN.md` (stage table, settings, build order) and is removed from here. Rejected ideas are marked and kept so they are not proposed again.

**Status values:** 💡 idea, not discussed · 🗣️ discussed, open questions · ✅ approved, move to `PLAN.md` · ❌ rejected.

## 1. Code navigation for Claude (requested 2026-11-05)

**Moved to `PLAN.md` on 2026-11-05 (approved):** the approach (VS Code's language features, no language server of our own), the tools (`findReferences`, `goToDefinition`, `documentSymbols`, `workspaceSymbols`, `hover`, `callHierarchy`, `readSymbol`, `findImporters`, the `kind` filter), the design rules, and the delivery (an MCP server of our own; the IDE server stays for editor context and `openDiff`). See `PLAN.md` section 8 and stage 5. The scope there is JavaScript and React only.

**Still here (not yet reviewed):**

### 1.1 Navigation results shown in the chat — 💡 (not chosen so far)
The chat renders a navigation call as a compact Hebrew card ("מקומות שימוש של X: 12 תוצאות") whose lines open the file at that line in the editor. Gives the user the same view Claude has. Open: whether the chat already makes `path:line` clickable.

### 1.2 Other helpers — 💡
- **Repository map:** one call that returns folders plus the top-level symbols per file, so Claude can orient itself cheaply. Open: worth a tool, given that `Glob` and `documentSymbols` exist?
- **Open at symbol:** `openFile` that jumps to a symbol, so the user sees what Claude is looking at.

### 1.3 Considered and left out — ❌ (proposed; user to confirm)
- **Rename / refactor through providers** (`vscode.executeDocumentRenameProvider`): edits must go through the per-block approval flow of package F, so this is not proposed.
- **`signatureHelp`:** overlaps `hover`; skipped on 2026-11-05.

## 2. .NET support (requested 2026-11-05)

**Background:** the user works in JS/React and in C# on .NET 6. In VS Code, JS/React navigation works (`PLAN.md` section 8); C# has no navigation because no C# extension is installed, and the .NET work is probably done in Visual Studio 2022. **Depends on the extension (the project's core), after the base packages.** Nothing here is decided. Constraint: no internet (`AGENT_CONTEXT.md`); files can be brought in, no network installs.

### 2.1 Option A: C# navigation inside VS Code through a C# extension — 💡
- Bring a C# extension in as a `.vsix` file and install it by hand ("Install from VSIX"). Candidate: the open-source community build `muhammad-sammy.csharp` from open-vsx.org (from memory, **not verified**). The Microsoft C# extension is another candidate; C# Dev Kit is not suitable (licence and sign-in).
- Once it works, the navigation tools in `PLAN.md` section 8 (`findReferences`, `goToDefinition`, and so on) cover `.cs` files with **no work on our side**, because they use VS Code's providers.
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
1. Is C# worth any effort now, or does it wait until the JS tools (`PLAN.md` section 8) are built?
2. If A: can the user bring in a `.vsix` and run the F12 check?
3. If B: is the goal Claude inside Visual Studio, or only C# navigation?
