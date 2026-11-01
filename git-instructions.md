# Git instructions

- Work on `develop`, or on the branch the user or the session names explicitly. One commit per finished task (code + its docs + any spec change together).
- Stage only the files the task touched; never `git add -A`. Never force-push, never skip hooks.
- Push only when the user explicitly asks (remote: `origin` on GitHub). Merge into a main branch only when the user decides a version is ready.
- Commit messages end with the trailer lines the session gives (`Co-Authored-By`, `Claude-Session`).
- The user's own machine has no GitHub access: anything meant to run there is delivered as a file (see `AGENT_CONTEXT.md`, working agreements).
