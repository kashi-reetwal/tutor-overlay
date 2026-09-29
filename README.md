# Tutor Overlay

A Windows desktop agent you invoke with a global hotkey (`Alt+T` by default). It captures the **active window**, sends a cropped/downscaled screenshot plus a tutoring prompt to a cloud vision model, and shows the answer in a small floating card you can read and follow up on.

**Status:** v1 in progress. Windows-first. Cloud-vision default. Voice/TTS deferred.

**What it is:**
- Press hotkey → capture active window → AI tutor analyzes the screen → answer appears in a floating card
- Follow-up questions work inside the card (small tutor conversation, not a one-shot summary)
- Voice is a reserved slot for later; not in v1

**What it is not (v1):**
- Not macOS (later)
- Not continuous screen recording (only on hotkey)
- Not TTS/voice (later)
- Not region drag-select (later)
- Not a local-model app (cloud vision default for v1)

## Prerequisites

- Windows
- Rust toolchain
- Node.js
- Git (credential store configured for GitHub pushes)

## Run

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

## Docs

- `docs/SPEC.md` — current product target and non-target
- `docs/ADR.md` — architecture decisions and why
- `docs/TECHSTACK.md` — what we use and where to look when it breaks
- `docs/LEARNING.md` — personal learning notes (JS/TS/React/Tailwind/Rust/Tauri/Windows capture)
- `docs/PLAYBOOK.md` — how to run, test, package, verify
- `docs/WORKLOG.md` — chronological notes

## Hotkey

Default: **Alt+T**. Configurable in `tauri.conf.json` and later in-app.

## AI provider

v1 uses a cloud vision model behind an env-backed config so it's easy to swap later. Image is cropped/downscaled before sending to keep cost and latency down.
