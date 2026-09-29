# Tutor Overlay — Technology Stack Register

Operational reference: what we use, why, where it hurts, and where to look first when it breaks. Updated when we add or change a technology.

---

## App framework — Tauri v2

**What.** Rust-based desktop app toolkit. Rust backend + webview frontend. v2 is the current major version.

**Why.** Small binary, lower runtime memory than Electron, Rust backend for capture/hotkey/AI glue, plugin model for global shortcuts and window config.

**Where it hurts.** Transparent + click-through overlay behavior is still fiddly on Windows. Tauri is not itself a screen-capture library. Version-specific APIs can differ from older tutorials.

**First place to look when it breaks.**
- Frontend not showing? Check Tauri window config and the renderer entry point.
- Backend command not reachable? Check Tauri capabilities/permissions and the `invoke` wiring.
- Window not behaving as expected? Check `tauri.conf.json` window settings before blaming the frontend.

**Key concepts to learn.** Tauri app lifetime, `invoke` IPC, capabilities/permissions model in v2, window config, plugin usage.

---

## Frontend — React + TypeScript

**What.** UI library + typed JS superset for the floating card and app shell.

**Why.** Component model is widely useful and matches the learning goal. TypeScript keeps the IPC payload and AI response shapes explicit.

**Where it hurts.** State timing and closure staleness can make the UI look "not updated" when it actually is. Streaming UI needs care so it doesn't feel janky.

**First place to look when it breaks.**
- Card didn't open/close? Check state machine and the event handler that triggers the open.
- Answer didn't render? Check the data shape coming from the backend and the streaming/state update path.
- UI looks wrong but data is fine? Check Tailwind classes and component layout.

**Key concepts to learn.** Component state, controlled inputs, streaming-friendly rendering, typing the backend contract.

---

## Styling — Tailwind CSS

**What.** Utility-first CSS framework.

**Why.** Fast way to build a small floating card without writing a pile of custom CSS. Good fit for a compact overlay UI.

**Where it hurts.** It's easy to over-use utilities or to try to solve window-level behavior (always-on-top, transparency) with CSS — that's not where those live.

**First place to look when it breaks.** Class names, layout structure, and whether the issue is actually a window/config issue rather than a styling issue.

**Key concepts to learn.** Utility composition, flex/positioning for a floating card, keeping the card small and readable.

---

## Backend language — Rust

**What.** Systems language for the Tauri backend.

**Why.** Good fit for capture, hotkey, and AI-glue code; required by Tauri's backend.

**Where it hurts.** Ownership/borrowing errors can feel opaque at first. Compile errors are usually precise but can be long.

**First place to look when it breaks.**
- Compile error? Read the first and last lines; the middle is often noise.
- Runtime panic? Look for unwraps on capture or AI IO paths.
- Data not moving where expected? Check ownership and the module boundaries.

**Key concepts to learn.** Modules, `Result` error handling, ownership when moving captured image data around, async/task shapes for AI calls.

---

## Windows capture — DXGI Desktop Duplication and/or Windows Graphics Capture

**What.** Windows APIs for capturing screen/window content. DXGI Desktop Duplication is the classic low-overhead path; Windows Graphics Capture (WGC) is the more modern, cross-GPU-friendly path.

**Why.** Needed for the "capture active window" behavior. Several Rust crates wrap these APIs.

**Where it hurts.** Some windows/content can come back blank or blocked (secure desktop, certain protected content, composition edge cases). Multi-monitor and GPU-affinity quirks exist. DPI/scaling can make the captured image look wrong if you assume pixels == logical units.

**First place to look when it breaks.**
- Blank capture? Check whether the target window is actually capturable and whether fallback triggered.
- Capture looks stretched/wrong size? Check DPI/scaling and the image size you're sending onward.
- Only some apps fail? Likely a protected/secure content case rather than a bug in the capture code.

**Key concepts to learn.** What a frame is, active-window vs full-screen capture, fallback behavior, why a window can be blank, DPI awareness.

---

## Global hotkey — Tauri global-shortcut plugin + Windows registration realities

**What.** Tauri plugin for registering a system-wide hotkey.

**Why.** Core invocation mechanism for v1.

**Where it hurts.** Can fail silently if another app owns the shortcut, or if elevation mismatches matter. Some combos are a bad idea (confusable with app shortcuts).

**First place to look when it breaks.**
- Hotkey didn't fire? Check registration success at startup and the visible warning path.
- Fires sometimes but not others? Consider collision/elevation/context issues.

**Key concepts to learn.** Registration, verification, graceful failure UI, choosing a non-colliding default.

---

## AI provider (v1) — cloud vision model, env-configured, swappable

**What.** A cloud multimodal model API used to interpret the screenshot and produce a tutoring answer.

**Why.** Best screen understanding for v1 with minimal infra. Configurable so we can swap later.

**Where it hurts.** Per-use cost and cloud dependency. Sending too much image data wastes money and latency. Weak models can hallucinate screen content.

**First place to look when it breaks.**
- No answer / error? Check provider config, network, and the request shape.
- Weird answer? Check whether the image was actually captured and sent, and whether the prompt is doing its job.
- Too expensive/slow? Check image size and cropping.

**Key concepts to learn.** Prompt + image as one unit, payload reduction by cropping/downscaling, streaming, how to judge whether the model read the screen.

**v1 default.** Env-configured cloud vision model. The exact model is a config choice, not a hardcode; we pick a cheap-but-viable option initially and make swapping easy.

---

## IPC — Tauri `invoke` + events

**What.** How the React frontend talks to the Rust backend.

**Why.** Needed for hotkey-triggered actions, capture results, and AI answers.

**First place to look when it breaks.** Determine whether the problem is in the frontend call, the backend handler, or the data shape in between.

**Key concepts to learn.** `invoke` contract, error propagation, events for streaming/status updates.

---

## Packaging / release — Tauri Windows build

**What.** Produces a Windows app bundle/executable from the Tauri project.

**Why.** We want a runnable Windows app, not just a dev server.

**First place to look when it breaks.** Build output, missing assets, config issues, and whether the dev build works at all before debugging the release build.

**Key concepts to learn.** Tauri build command, output artifacts, basic smoke test before sharing.

---

## Authentication for pushes — Git credential store with PAT

**What.** `~/.git-credentials` store holding a GitHub PAT, used instead of GCM's interactive OAuth flow.

**Why.** Avoids repeated login prompts on push, matching the EZ Buddy workflow on this machine.

**Where it hurts.** The PAT is stored in plaintext on disk in the credential file, so it should be treated as sensitive and rotated if the machine is shared or compromised.

**First place to look when it breaks.** Credential store contents, remote URL scheme, and whether SSH is being used instead.

**Key concepts to learn.** Credential store vs credential manager, PAT scopes, SSH as an alternative.

---

## Not in v1 (listed for clarity)

- Text-to-speech / voice
- Region drag-select capture
- Local model runtime
- macOS
- Continuous screen recording
- Persistent screenshot history
- In-app hotkey reassignment UI (config file for now)
