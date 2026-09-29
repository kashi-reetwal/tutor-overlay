# Tutor Overlay — Architecture Decision Records (ADR)

Living document. Every significant decision gets a numbered entry **when it is made**, not after.

Statuses: `Proposed` → `Accepted` → `Superseded by ADR-xxx` / `Deprecated`.

Entry format: **Title · Status · Date · Context · Decision · Consequences · Alternatives considered.**

---

## Index

| # | Decision | Status |
|---|---|---|
| 001 | New repo for the Windows tutor overlay, separate from EZ Buddy | Accepted |
| 002 | Tauri v2 + React + Tailwind | Accepted |
| 003 | Rust backend owns capture, hotkey, AI glue; React frontend owns the floating card | Accepted |
| 004 | Windows first; macOS later | Accepted |
| 005 | Default capture target is active/focused window; full screen fallback | Accepted |
| 006 | Cloud vision model default for v1; local model deferred; minimize payload with crop + downscale | Accepted |
| 007 | Voice/TTS deferred; answer pipeline reserved for it later | Accepted |
| 008 | Global hotkey registration must be verified at startup and degrade gracefully if it fails | Accepted |
| 009 | Use credential store for GitHub pushes, not GCM interactive OAuth, to avoid repeated login prompts | Accepted |

---

## ADR-001 — New repo for the Windows tutor overlay

**Status:** Accepted · **Date:** 2026-09-29

**Context.** The tutor overlay is a desktop app, not a web app. EZ Buddy is a Next.js web app. Mixing them in one repo would combine two different deployment, runtime, and packaging models and make both harder to reason about.

**Decision.** Create a new repo `kashi-reetwal/tutor-overlay` for the tutor overlay.

**Consequences.** (+) Clean separation of concerns. (+) Desktop app has its own docs, packaging, and runtime story. (-) Two repos to maintain instead of one.

**Alternatives considered.** One repo with `apps/tutor/` alongside EZ Buddy. Rejected because the two projects share almost nothing at the runtime/packaging layer, and the web app's assumptions would quietly leak into the desktop app.

---

## ADR-002 — Tauri v2 + React + Tailwind

**Status:** Accepted · **Date:** 2026-09-29

**Context.** We need a small Windows desktop app with a floating overlay-style card, a Rust backend for capture and system integration, and a web-tech frontend for the UI. We also want the app to be small and fast to start, and we want the frontend to be learnable alongside the build.

**Decision.** Use Tauri v2 with a React + TypeScript frontend and Tailwind CSS for styling.

**Consequences.** (+) Small binary and lower runtime memory than Electron. (+) Rust backend for capture/hotkey/AI glue. (+) React + Tailwind are widely useful and match the learning goal. (-) Transparent/click-through overlay behavior is still fiddly; we keep v1 simple and visible rather than over-engineering transparency.

**Alternatives considered.** Electron (heavier, less compelling now for a small overlay app), Svelte (nice but narrower learning payoff for this project), plain Rust native UI (more work for the overlay card UI we want). React + Tailwind won for learning value and fit.

---

## ADR-003 — Rust backend owns capture, hotkey, AI glue; React frontend owns the floating card

**Status:** Accepted · **Date:** 2026-09-29

**Context.** Screen capture, global hotkey registration, and AI-provider calls are system/backend concerns. The floating card, streamed answer display, and follow-up input are UI concerns.

**Decision.** Rust backend handles capture, hotkey, and AI-glue. React frontend handles the card UI and user interaction. They talk through Tauri IPC.

**Consequences.** (+) Clear boundary between system layer and UI layer. (+) Easier to test capture and AI parts independently. (-) Requires discipline about what runs where; misplacing logic leads to confusing bugs.

**Alternatives considered.** Doing capture in frontend via a JS lib. Rejected because Windows capture is a system-integration task and belongs in the backend.

---

## ADR-004 — Windows first; macOS later

**Context.** Windows capture and overlay behavior are good enough for v1, and the user wants Windows first.

**Decision.** Build for Windows first. macOS comes later, after the Windows core loop is solid.

**Consequences.** (+) Faster v1 on the chosen platform. (-) macOS will need its own capture/permission/overlay work later and should not be assumed by v1 code.

**Alternatives considered.** Both platforms at once. Rejected as too much surface for v1.

---

## ADR-005 — Default capture target is active/focused window; full screen fallback

**Context.** Capturing the whole screen is simpler but gives more noise and more privacy exposure. Capturing the active window is usually what the user means when they invoke the tutor over the thing they're reading.

**Decision.** Default to active/focused window capture. Fall back to full screen if that fails.

**Consequences.** (+) Cleaner context for the AI. (+) Less privacy exposure. (-) Active-window capture is a bit more involved than full-screen capture; we still keep full-screen fallback for robustness.

**Alternatives considered.** Always full screen. Rejected as too coarse. Always active window with no fallback. Rejected because robustness matters on v1.

---

## ADR-006 — Cloud vision model default for v1; local model deferred; minimize payload with crop + downscale

**Context.** We want the cheapest viable AI that still reads screens reasonably well. A local model adds infra, setup, and quality uncertainty for v1.

**Decision.** Use a cloud vision model for v1, configured via env and designed to be swappable. Crop and downscale screenshots before sending to reduce cost and latency.

**Consequences.** (+) Faster to ship. (+) Better screen understanding for v1. (-) Per-use cost and cloud dependency. (-) Local model path is deferred, not eliminated.

**Alternatives considered.** Local model from the start. Rejected as too much scope and too much quality/setup uncertainty for v1.

---

## ADR-007 — Voice/TTS deferred; answer pipeline reserved for it later

**Context.** Voice is important to the longer-term "speaking teacher" feel, but it is not necessary for the first working loop.

**Decision.** Do not add TTS in v1. Shape the answer pipeline so a TTS branch can be added later without a refactor.

**Consequences.** (+) Smaller v1. (+) Voice can be added as a parallel pipeline later. (-) Voice is not available in v1 even if it would be nice.

**Alternatives considered.** Add a simple voice path in v1 anyway. Rejected to keep v1 focused and avoid TTS-specific edge cases early.

---

## ADR-008 — Global hotkey registration must be verified at startup and degrade gracefully if it fails

**Context.** Global hotkeys can fail silently on Windows (collision, elevation mismatches, other apps owning the shortcut). A tutor that doesn't fire when invoked is worse than useless.

**Decision.** Register the hotkey at startup, verify registration, and show a visible warning if it fails. Do not assume the hotkey works.

**Consequences.** (+) Bugs in hotkey registration are visible rather than mysterious. (-) Slightly more startup logic. (-) We still need to pick a hotkey unlikely to collide.

**Alternatives considered.** Register and hope. Rejected because silent failure is the common failure mode.

---

## ADR-009 — Use credential store for GitHub pushes, not GCM interactive OAuth

**Status:** Accepted · **Date:** 2026-09-29

**Context.** On this machine, the GitHub credential flow kept prompting for login on every push attempt. EZ Buddy worked because it had a non-interactive credential path. We want the same "commit and push without repeated prompts" behavior here.

**Decision.** Use Git credential store with a stored PAT for GitHub pushes, instead of relying on GCM's interactive OAuth flow.

**Consequences.** (+) Pushes no longer prompt repeatedly. (+) Matches the EZ Buddy-style workflow. (-) Credential store holds a PAT in plaintext on disk, so the token should be treated as sensitive and rotated if the machine is shared or compromised.

**Alternatives considered.** Keep using GCM and somehow complete its interactive flow every time. Rejected because that is exactly the problem we are solving. SSH-only pushes. Possible, and SSH already works here; for now we also keep the HTTPS credential-store path working so pushes are non-interactive.
