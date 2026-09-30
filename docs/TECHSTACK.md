## Project layout — how the repo is wired for Tauri v2

The repo is organized so Tauri CLI can own the Rust app while the frontend stays in `frontend/`.

- Root `package.json` — orchestrator scripts only: `npm run dev:frontend`, `npm run dev:tauri`, `npm run build`, `npm run tauri`.
- Root `tsconfig.json` — tooling-level TypeScript config; real typing lives in `frontend/tsconfig.json`.
- `frontend/` — React + TypeScript + Tailwind + Vite. This is the renderer.
- `src-tauri/` — the Tauri app crate: `Cargo.toml`, `build.rs`, `src/main.rs`, `src/lib.rs`, `src/commands/`, and Tauri config under `tauri/` via the build context.
- `tauri/` — Tauri config files used by the build context: `tauri.conf.json` and `capabilities/`.
- `src/` — legacy hand-wired Rust skeleton from the early scaffold. Not the active Tauri app crate; kept only until `src-tauri/` is fully in use.

This split matters because Tauri CLI expects the app crate to live in `src-tauri/` by default. If you try to run `tauri dev` against the old `src/main/` layout, it will not match the project model the CLI expects.

## App icon

`tauri/icon.png` is an AI-generated neon cyber-tutor graduation cap and lens icon in high-res glossy 3D aesthetic, replacing the earlier 1x1 placeholder.

## Toolchain & Runtime

- **Rust:** `stable-x86_64-pc-windows-gnu` managed via `rustup`.
- **C/C++ Linker:** WinLibs MinGW-w64 64-bit GCC/binutils suite.
- **Frontend & CLI:** Node.js 24 + npm 11 + `@tauri-apps/cli` v2.
- **WebView:** Microsoft Edge WebView2 runtime.

## Env and secrets

- `.env.example` documents the expected AI-provider fields (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`).
- `.env.local` is git-ignored and holds real values.
- The backend AI module reads from `.env` or `.env.local` via `dotenvy`.

## Not in v1 (listed for clarity)

- Text-to-speech / voice
- Region drag-select capture
- Local model runtime
- macOS
- Continuous screen recording
- Persistent screenshot history
- In-app hotkey reassignment UI (config file for now)
