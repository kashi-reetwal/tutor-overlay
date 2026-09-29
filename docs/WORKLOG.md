# Tutor Overlay — Work Log

One small note per change, newest last. If a change touched stack, capture, hotkey, AI, privacy, or a prior ADR, the matching doc was updated in the same commit.

---

## 2026-09-29 — Repo creation and doc brain

- Created new repo `kashi-reetwal/tutor-overlay` (public, SSH remote) separate from EZ Buddy.
- Set up Git credential store with a PAT so pushes are non-interactive, matching the EZ Buddy workflow on this machine. SSH also works.
- Seeded the doc brain: README, LICENSE, .gitignore, AGENTS.md, SPEC.md, ADR.md, TECHSTACK.md, LEARNING.md, PLAYBOOK.md, WORKLOG.md.
- Recorded the decisions we already made as ADRs (new repo, Tauri v2 + React + Tailwind, Rust backend for capture/hotkey/AI, Windows first, active-window capture default, cloud vision default, voice deferred, hotkey verification, credential-store auth).
- Confirmed the repo can push without repeated login prompts.
- First commit pushed: repo skeleton + doc brain + Tauri-ready structure + frontend card shell.
- Next: scaffold the Tauri app shell and the floating card frontend.

*(New entries go below this line, newest last.)*

---

## 2026-09-29 — Initial skeleton pushed

- Committed and pushed the first real skeleton commit to `main`.
- Includes README, LICENSE, .gitignore, AGENTS.md, SPEC.md, ADR.md, TECHSTACK.md, LEARNING.md, PLAYBOOK.md, WORKLOG.md.
- Includes Tauri v2 backend skeleton under `src/main/` and a React + TypeScript + Tailwind frontend shell with a floating tutor card UI.
- Includes `tauri.conf.json` with an overlay-style window config and the global-shortcut plugin placeholder.
- Includes `capabilities/default.json` with the window + global-shortcut permissions we expect to need.
- Push used the credential-store PAT path, no login prompt.
- Still to do: wire up the actual Tauri app so `npm run tauri dev` launches the card shell, then add hotkey, capture, and AI step by step.
