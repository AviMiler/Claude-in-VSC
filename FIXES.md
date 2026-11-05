# Fix list

Problems found by the user while running the manual tests (`dev/manual-tests.html`), first run on 2026-11-02 (VS Code 1.91.1, real CLI 2.1.246, models `qwen3.8:27b`, `qwen2.5:7b`, `qwen3:latest`). Each item: what was reported, what is known, status. When an item is fixed, move it to `CHANGELOG.md` and delete it here. Priorities: **P1** blocks normal use or is a wrong behaviour, **P2** missing or confusing, **P3** polish.

## Test run 2026-11-02: summary
PASS with no complaint: 1.1, 1.2, 3.1, 4.1-4.3, 5.1, 5.2, 6.1, 7.2, 9.1, 10.1, 12.2, 13.1, 13.3, 15.1, 20.1, 21.1, 23.1. **FAIL: 2.2, 7.1, 11.1, 12.3.** PASS with a complaint: 8.1, 13.2, 14.1, 16.1, 17.1, 18.1, 19.1, 24.1. Not run: 1.3, 2.3 (the log shows it worked), 2.4, 22.1, 24.2. 24.3 was run in the CLI terminal, not in the extension, so the `/loop` indicator is still unverified.

## Order of work (decided by the user, 2026-11-02)
1. ~~**Fix 1: the basic interface** = F-1, F-2, F-3~~ **Done 2026-11-02** on branch `fix1-ui-foundation` (also F-10); see `CHANGELOG.md`. Still open from it: real VS Code checks, and screenshots of the official extension during a conversation to finish matching the look.
2. **Next: Fix 2** = F-4, F-5, F-7 done 2026-11-05; F-6 unverified.
3. ~~F-8 model switch loads two models, F-9 context meter 1,000,000~~ **Done 2026-11-05** (`--settings`; see `CHANGELOG.md`). Still open from it: the user's check on CLI 2.1.246 (`dev/check-model-switch.txt`). (F-10 is done.)
4. ~~F-11 images, F-12 rewind button, F-14 always-allow, F-15 URI docs, F-16 test page~~ **Done 2026-11-05** (unverified in real VS Code).
5. F-17 minor items: **done 2026-11-05** except test 2.4 (user) and the `@`/`/doctor` repeat of test 7.1.
Fixes run in the usual workflow, one model per task as `AGENT_CONTEXT.md` requires. Note for F-6: Ctrl+Shift+T and the tab dots changed in Fix 1 (the dots are now drawer dots, `view.badge` and the tab title marker).

## P1

### F-6 Ctrl+Shift+T and tab colour dots do not work (test 12.3, FAIL)
- **Status:** code done 2026-11-05 (`when` clause widened to a focused sidebar view; `popClosed` now refreshes `hasClosed`; by-design limits documented in `spec.md`/`SETUP.md`; see `CHANGELOG.md`). **Still open: the user's check in real VS Code** (Ctrl+Shift+T from the sidebar with a file editor open; test 12.3). Delete this item once it passes.


## P3

### F-17 Minor
- Tests 2.3 and 2.4 were marked NOT RUN, but the log of 2.3 shows the settings changing correctly; 2.4 (Show Log / Copy Log) is still unchecked.
- Models like `qwen2.5:7b` print tool calls as JSON text and answer in Chinese or mixed language: a model limit, not an extension bug.
- Math (from the Opus review, low): a placeholder inside a link title (`[a](u "$x$")`) breaks that link's markup (not exploitable); `$a$` inside 4-space-indented code or fenced code nested in a list is rendered as math.
- The source instruction is not repeated after a rewind to before the message that carried it (only after a new CLI process).
