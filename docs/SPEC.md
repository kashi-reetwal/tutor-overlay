# Tutor Overlay — Product Spec (v1)

Living document. If the product drifts from this, update it and note why.

## Goal

A Windows desktop app you invoke with a global hotkey. It captures the active window, sends a cropped screenshot plus a tutoring prompt to a cloud vision model, and shows the answer in a small floating card. You can read the answer, ask a follow-up, and dismiss the card.

## Target user

A person reading something on screen — a PDF, a web article, slides, code — who wants a quick on-demand tutor explanation without leaving the app they're in.

## Platform scope

- **Windows first.**
- macOS later.
- Linux later if it proves worth the capture pain.

## Core flow (v1)

1. User presses hotkey (`Alt+T` by default).
2. App captures the **active/focused window**.
3. If active-window capture fails, fall back to **full screen**.
4. Crop and downscale the captured frame.
5. Send image + tutoring prompt + optional small context to a cloud vision model.
6. Stream the answer into a floating card.
7. User can read, optionally ask a follow-up, and dismiss.

## Features in v1

- Global hotkey invocation.
- Active-window capture with full-screen fallback.
- Floating answer card with streamed text.
- Minimal follow-up input in the card (small conversation, not a full chat app).
- AI provider config via env, swappable shape.
- Basic app state: idle, capturing, thinking, answering, ready.

## Defaults

- Hotkey: **Alt+T**.
- Capture target: active window first, full screen fallback.
- AI: cloud vision model, cheapest viable option that still reads screens decently.
- Image handling: crop + downscale before sending.
- Voice: not in v1, but the answer pipeline is shaped to admit TTS later.

## Out of scope for v1

- Text-to-speech / voice UI
- Region drag-select capture
- Local model runtime
- macOS
- Continuous screen recording
- Persistent screenshot history
- Persona switcher beyond one default tutor
- Export/history features
- In-app hotkey reassignment UI (config via config file for now)

## Privacy posture

- No continuous capture.
- Capture only happens on hotkey press.
- No default persistence of screenshots.
- Visible cue when capture happens.
- Capture failures (blank/blocked frames) are handled explicitly rather than sent to the AI as if they were real content.

## Success criteria

- Hotkey fires and is detectable by the app.
- Capture returns a real image of the active window in the common case.
- The AI answer actually references what is on screen.
- The answer streams into the card.
- Blank or blocked captures do not produce garbage AI answers.
- The card opens and closes cleanly.

## Open questions

- Exact cloud vision model choice for cheapest-viable tier (env-configured, swappable).
- Whether hotkey should be configurable in-app in v1 or only via config file for now.
- Exact position/placement behavior for the floating card in v1.
