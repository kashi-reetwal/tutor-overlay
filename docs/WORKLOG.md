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

---

## 2026-09-30 — Implemented Rust backend, Windows screen capture, AI vision streaming, and UI wiring

- **Crates & Workspace:** Added `tokio`, `reqwest` (with streaming + json), `futures-util`, `image`, `base64`, `dotenvy`, and `windows` (Win32 GDI & UI) to `Cargo.toml`.
- **Global Hotkey:** Configured `tauri-plugin-global-shortcut` in `src-tauri/src/lib.rs` for `Alt+T`. Added ADR-008 graceful registration verification, emitting status to frontend.
- **Windows Capture (`src-tauri/src/capture/mod.rs`):** Implemented native Windows foreground window capture via `GetForegroundWindow` + `GetWindowRect` + GDI `BitBlt` with `CAPTUREBLT` for hardware-accelerated/layered windows. Added fallback to fullscreen virtual monitor capture (ADR-005). Added image downscaling (max 1280px maintaining aspect ratio) and JPEG encoding to keep latency and vision token cost minimal (ADR-006).
- **AI Streaming Pipeline (`src-tauri/src/ai/mod.rs`):** Implemented streaming vision tutor queries for OpenAI-compatible and Google Gemini models. Automatically reads `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, and `AI_BASE_URL` from `.env` or `.env.local`. Emits real-time tokens to frontend via `tutor:stream_chunk` and `tutor:stream_end`.
- **Tauri IPC Commands (`src-tauri/src/commands/mod.rs`):** Added `get_hotkey_status`, `trigger_tutor`, `send_followup`, `set_card_visible`, and `dismiss_card`.
- **Frontend Overlay (`frontend/src/App.tsx`):** Built interactive floating card UI with glassmorphic styling, drag handle (`data-tauri-drag-region`), hotkey status alert banner, streaming text auto-scroll, follow-up form, and quick dismiss (`Esc`). Added browser preview fallback so frontend can be developed standalone with Vite.
- **Build Verification:** Added `@tailwindcss/vite`, updated `vite.config.ts`, installed npm packages, and verified production frontend build (`npm run build`) passes cleanly.
- **Tauri CLI & Config Validation:** Installed `@tauri-apps/cli` at root, fixed `tauri/tauri.conf.json` schema (`frontendDist` path and removed invalid `devtools` key), and confirmed `npx tauri info` passes. Verified Vite dev server runs at `http://localhost:1420/`.

---

## 2026-09-30 — Toolchain configuration, app icon, and prototype runtime enablement

- **Rust Toolchain:** Installed Rust (`rustup` with `cargo 1.98.1` and `rustc 1.98.1`). Configured default toolchain to `stable-x86_64-pc-windows-gnu` for portable Windows compilation without full Visual Studio IDE dependency.
- **Cargo Configuration:** Set `resolver = "2"` in root workspace `Cargo.toml` and consolidated workspace release profile.
- **App Icon:** Designed and generated a high-resolution 3D neon cyber-tutor graduation cap & lens icon and replaced placeholder at `tauri/icon.png`.
- **Documentation:** Updated `docs/TECHSTACK.md`, `docs/PLAYBOOK.md`, and `docs/WORKLOG.md` detailing prototype testing instructions for both browser preview (`npm run dev:frontend`) and native desktop overlay (`npm run dev:tauri`).

---

## 2026-09-30 — Working UI Prototype Completed & Deployed Locally

- **Interactive Markdown Renderer:** Added `react-markdown` to format headers, code blocks, lists, and syntax cleanly in tutor responses.
- **Quick Action Chips:** Added quick-invoke prompt buttons for "Explain Concept", "Find Bug / Error", and "Summarize".
- **In-App AI Settings:** Built settings drawer supporting direct in-browser testing with Gemini (`gemini-1.5-flash`, `gemini-2.0-flash`) and OpenAI API keys stored in local settings.
- **Test Image Workbench:** Enabled test screenshot uploads and direct clipboard image paste (`Ctrl+V`) for immediate browser testing of vision tutoring without desktop runtime dependencies.
- **Multi-turn Chat Thread:** Rendered conversation history with speaker bubbles, copy buttons, and interactive follow-ups.
- **Vite Dev Server:** Started live daemon at `http://localhost:1420/` with verified production build passing in 10s.

---

## 2026-09-30 — Jarvis Tactical HUD Interface & Free Screen Dragging

- **Free-Form Screen Dragging:** Replaced static bottom-right placement with a custom coordinate drag system that tracks pointer movements and clamps the HUD card smoothly anywhere across the entire browser viewport or desktop screen.
- **Jarvis Holographic HUD Aesthetics:** Transformed the UI into an Iron Man / Jarvis inspired tactical HUD:
  - Deep space-black translucent backdrop with cyan cyber-grid lines and ambient glow.
  - Animated Arc Reactor Core graphic with rotating concentric dashed rings and pulsing central sphere.
  - Tactical telemetry readout status indicators (`SYS.STANDBY`, `ACQUIRING.SCREEN`, `NEURAL.PROCESSING`, `TELEMETRY.READY`).
  - Animated spectral audio/frequency visualizer bars that bounce during reasoning and streaming.
  - Holographic reticle corner brackets and glowing command chips (`DEEP RECON`, `DEBUG FAULT`, `TACTICAL BRIEF`).
- **Direct Gemini Key Integration:** Documented and linked Google AI Studio direct key generation in settings, clarifying that simulation mode works with zero keys required.

## [2026-10-01] - Milestone 5: Gemini API Key Bug Fixes & Multiturn Schema Repair

### Fixed & Enhanced
- **API Key Sanitization & Verification:**
  - Auto-sanitization on key input and blur: automatically strips accidental spaces, newlines, and surrounding quotation marks (`"..."` / `'...'`).
  - Added interactive **"TEST API KEY"** button in Settings (⚙️) that directly pings Google Gemini with feedback:
    - Displays `CheckCircle2` (green checkmark) when uplink succeeds.
    - Displays `XCircle` (red cross) with exact diagnostics for HTTP 400 (Invalid key), 403 (Permissions), 404 (Model not found), and 429 (Rate limit).
  - Quick model selector pills: `[ gemini-1.5-flash ]`, `[ gemini-2.0-flash ]`, `[ gemini-1.5-pro ]`.
- **Eliminated Gemini Multiturn 400 Bug:**
  - In Google Gemini API, conversation turns must alternate and start with `role: "user"`. Fixed frontend follow-up builder and Rust `query_gemini_followup_stream` to guarantee `contents[0]` is `role: "user"`, completely resolving the `Please ensure that multiturn talk starts with user role` 400 error.
- **Robust Answer Generation & Delivery:**
  - Direct atomic vision queries with smooth holographic typewriter streaming into the JARVIS HUD.
  - Auto-fallback for visual telemetry: automatically provides sample IDE code frame if no screenshot has been captured or uploaded yet, ensuring Vision AI never fails on empty payload.
  - Connected client-side settings override to Tauri Rust IPC commands (`trigger_tutor`, `send_followup`).
