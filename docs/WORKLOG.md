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

---

## 2026-09-30 — Project layout completed for a runnable Tauri v2 app

- Reorganized the repo so it matches the Tauri v2 project model Tauri CLI expects.
- Added root `Cargo.toml` as a workspace with `src-tauri` as the app crate.
- Added `src-tauri/` crate: `Cargo.toml`, `build.rs`, `src/main.rs`, `src/lib.rs`, `src/commands/mod.rs`.
- Moved Tauri config into standard locations: `tauri/tauri.conf.json` and `tauri/capabilities/default.json`.
- Removed the stale root `tauri.conf.json` and root `capabilities/` that did not match the Tauri CLI layout.
- Added root `package.json` with frontend + Tauri scripts: `dev:frontend`, `dev:tauri`, `build`, `tauri`.
- Added root `tsconfig.json` as a tooling-level config; real typing stays in `frontend/tsconfig.json`.
- Kept the existing frontend shell (`frontend/`) intact: React + TypeScript + Tailwind + Vite, with the floating tutor card UI.
- Added `.env.example` to document expected AI-provider env fields; `.env.local` remains git-ignored.
- Added a minimal valid 1x1 transparent PNG placeholder at `tauri/icon.png` so Tauri does not fail icon validation early.
- Updated `docs/TECHSTACK.md` and `docs/WORKLOG.md` to reflect the new layout.
- Still not runnable here yet: there is no Rust toolchain available in this environment, so `tauri dev` cannot be verified from here. Next step after this is done is to confirm the toolchain and run the app.
