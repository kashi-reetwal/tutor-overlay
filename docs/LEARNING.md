# Tutor Overlay — Learning Notes

This is a learner's notebook, not a docs dump. I write things here when something confuses me or when a mental model finally clicks, so the next pass is faster.

How to use this file: when I hit something that felt harder than it should have, I write one short note here. Not a tutorial. Just the thing that would have saved me time.

---

## TypeScript

- Types are most useful when they describe the contract between frontend and backend: the capture result, the AI request shape, the AI response shape, the hotkey status.
- If the app "works but feels wrong," check whether the data shape is what I assumed. A lot of "why didn't it render?" turns into "the data was shaped differently than I thought."
- If a type says one thing and the runtime does another, prefer the runtime evidence and then fix the type. Types help, but they are not the ground truth.

Things to practice:
- Typing the IPC payloads and responses.
- Typing the AI response so streaming and final rendering share one shape.
- Knowing when `any` is a temporary crutch and when it's just hiding a real shape question.

---

## React

- The floating card is a small state machine: idle, capturing, thinking, answering, ready. Making that explicit helps a lot.
- "UI didn't update" is usually one of: stale closure, state updated in the wrong place, or I expected a re-render where React doesn't re-render because nothing changed.
- Streaming answers need a model that can append or replace text as it arrives, without throwing away the part already shown.

Things to practice:
- Opening/closing the card from a hotkey-driven event.
- Rendering a streamed answer incrementally.
- Controlled input for the follow-up question.
- Keeping the follow-up flow simple in v1; not building a full chat app.

---

## Tailwind

- Think in utilities, not in "find the perfect class name." The question is usually "what layout am I trying to make?" not "what class do I want?"
- The floating card should be small, legible, and positioned on top. Keep it simple.
- Always-on-top and transparency are window-level concerns, not Tailwind concerns. Tailwind can style the card; it cannot make the window behave like an overlay by itself.

Things to practice:
- Building the card with a clean, compact layout.
- Using flex and positioning for a floating panel.
- Avoiding over-styling; v1 should look fine, not finished.

---

## Rust

- Modules matter early: decide where capture, hotkey, AI, and app setup live before the code gets tangled.
- `Result` is the normal way to carry errors. If I reach for `unwrap` a lot on capture or AI paths, that's a signal to handle errors properly.
- When a compile error is long, read the start and the end first. The middle is often a cascade.
- When moving captured image data between layers, ownership is the thing to think about first.

Things to practice:
- Splitting capture, hotkey, and AI into modules.
- Writing helper functions that return `Result` instead of panicking.
- Reading compiler messages without panicking.

---

## Tauri

- Frontend and backend are separate worlds connected by IPC. If something is "not working," one of the first questions is: which side is it actually on?
- Capabilities/permissions matter in v2. If an `invoke` or plugin call silently doesn't work, check whether the capability is configured.
- Window behavior (size, always-on-top, transparency) is configured in Tauri config, not in CSS.

Things to practice:
- Calling a Rust command from React via `invoke`.
- Wiring a status/events stream from backend to frontend.
- Configuring the window for a compact overlay-style card.

---

## Windows capture concepts

- A "frame" is one captured image of the screen or window at a moment in time.
- Active-window capture is usually more useful than full-screen capture for a tutor, because it matches what the user is looking at.
- Some content can't be captured cleanly: secure/protected content, certain system surfaces, composition edge cases.
- DPI and monitor scaling can make pixel sizes not mean what I expect. That affects cropping, downscaling, and what the AI ultimately sees.

Things to practice:
- Capturing the active window and saving an inspectable copy for debugging.
- Triggering the full-screen fallback when active-window capture fails.
- Not assuming a capture is "good" just because the call succeeded.

---

## AI integration concepts

- The prompt and the image are one unit. If the answer is bad, check both.
- Cropping and downscaling matter for cost and latency. A giant full-screen image is expensive and often unnecessary.
- Streaming changes the UX: the answer can feel faster if text arrives incrementally.
- "Is the model actually reading the screen?" is a real question. Test it with concrete screenshots where I know what should be said.

Things to practice:
- Building the request as image + prompt + small context.
- Downsizing the image before sending.
- Judging answer quality on known test screens.

---

## Debugging habit

When something fails, don't guess across layers. Use `docs/TECHSTACK.md` to pick the layer first, then reproduce with the smallest possible action, then write the finding in `docs/WORKLOG.md`.

Common first checks:
- Frontend: state, event handler, rendered output.
- Tauri: window config, capabilities, invoke wiring.
- Rust backend: module, error path, data passed back.
- Capture: did it return a real image, blank, or fail?
- Hotkey: did it register and fire?
- AI: config, network, request shape, image actually sent.

---

## Public references worth keeping around

- Tauri v2 docs and examples — first stop for window config, plugins, and IPC.
- Tauri community threads on transparent always-on-top overlays — useful for understanding the hard parts rather than assuming they're easy.
- Jan feature request #7075 — overlapping feature request; useful as a requirements cross-check for capture + overlay + hotkey + prompt template behavior.
- DXGI / Windows Graphics Capture Rust wrappers — reference for the capture layer shape.
- Screenpipe — conceptual reference for "screen as context for AI," though its model is continuous recording + search.
- OLLA prototype — reference for "hotkey → agent sees screen → acts," plus a reminder that even strong models still fail a lot on real desktop tasks.
