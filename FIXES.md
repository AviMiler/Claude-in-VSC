# Fix list

Problems found by the user while using the extension, to fix after the manual tests (`dev/manual-tests.html`). Each item: what was reported, what is known, status. Newest first. When an item is fixed, move it to `CHANGELOG.md` and delete it here.

## F-1 Conversation placement is confusing (reported 2026-11-02)
The user: the interface for where conversations open does not work for them.
- **Symptom:** several entry points open a conversation, and each time it can open in a different, unpredictable place (editor tab, secondary editor group, sidebar).
- **Known (from `package.json`, not yet checked in the code):** the entry points that open or create a conversation are `claude-local.editor.open` ("פתיחה בלשונית חדשה", Ctrl+Shift+Esc and Ctrl+Alt+C), `claude-local.editor.openLast` ("פתיחת Claude", the editor title button), `claude-local.sidebar.open`, `claude-local.newConversation`, `claude-local.history.open` (history list), `claude-local.continueLast` and `claude-local.reopenClosed`. Placement also depends on the settings `preferredLocation` and `lockEditorGroups`.
- **To decide with the user before coding:** one predictable rule for where a conversation opens, and whether to merge the three open buttons into one. Open questions: new tab beside the current one or reuse the open one; what the history list does when a conversation is already open.
- **Status:** open, not investigated.

## F-2 A new conversation does not open while another conversation is running (reported 2026-11-02)
- **Symptom:** "שיחה חדשה" (`claude-local.newConversation`, and probably the new-conversation button) does nothing while a conversation is running.
- **Known:** not reproduced yet. Candidates to check: the command is disabled or ignored while a turn is active (the same busy state that disables the model and mode pickers), or it reuses the running panel.
- **Expected:** a new conversation opens in its own panel even if another one is running; the running one is not interrupted.
- **Status:** open, not investigated. Needs a test in `test/` and a log line (`[session]`) for the refused case.

## F-3 Visual design needs polish (reported 2026-11-02)
- **Symptom:** the UI has some visual problems and is not polished ("צריך טאצ'").
- **Known:** no specific list yet. Needs screenshots from the user, or a pass in the browser preview (`.claude/launch.json`, "chat-preview") covering: spacing and alignment in RTL, the composer, tool rows, permission cards, the history list, the new bars (tasks, background tasks, `/loop`), dark and light themes, narrow widths.
- **Status:** open. Ask the user for screenshots of what bothers them first, then fix.
