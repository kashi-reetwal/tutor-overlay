# Tutor Overlay — Agent working rules

This file tells an agent (human or automated) how to work in this repo without drifting, re-litigating decisions, or leaving the tree in a half-finished state.

## Repo identity

- This is a **Windows-first desktop app** built with Tauri v2 + React + Tailwind, not a web app.
- The EZ Buddy repo is a separate project. Do not copy its web-app assumptions into this one.

## Documents are part of the work

The doc files are not decoration. They are how this repo stays understandable across sessions:

- `docs/SPEC.md` — current target and non-target
- `docs/ADR.md` — why we chose what we chose
- `docs/TECHSTACK.md` — what we use and where to look when it breaks
- `docs/LEARNING.md` — personal learning notes
- `docs/PLAYBOOK.md` — how to run, test, package, verify
- `docs/WORKLOG.md` — chronological notes

**Rule:** if a change touches stack, capture behavior, privacy behavior, AI provider behavior, hotkey behavior, or a prior ADR, update the relevant doc(s) in the same commit. A change that ships without the matching doc update is incomplete.

## Work rhythm

- Small, committed steps.
- Each step should leave the tree buildable or clearly marked as intentionally broken mid-change.
- Prefer one logical change per commit with a clear message.
- If you start something and don't finish it, say so in `docs/WORKLOG.md` and leave the tree in a recoverable state.

## Capture and privacy

This project touches screen capture. That is sensitive by default.

- v1 captures **only on hotkey**, not continuously.
- v1 does not persist screenshots by default.
- Any change to capture scope, retention, upload, or sharing must update `docs/ADR.md` and `docs/TECHSTACK.md`, and must be explicit in `docs/SPEC.md`.

## Debugging mindset

When something fails, do not guess across layers. Use `docs/TECHSTACK.md` to identify the layer first:

- Frontend (React/Tailwind)
- Tauri window/config
- Rust backend
- Windows capture
- Hotkey registration
- AI provider call

Then reproduce with the smallest possible action and record what you found in `docs/WORKLOG.md`.

## Learning

If something confuses you, write one short note in `docs/LEARNING.md` so the next pass is faster. This repo is meant to be learned from, not just shipped.

## Don't do

- Do not silently change capture behavior.
- Do not add a dependency or external service without recording it.
- Do not leave the app in a state where a build works but the behavior is undefined.
- Do not assume a Windows capture gives you what you expect; verify it.
