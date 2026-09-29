# Tutor Overlay — Operations Playbook (v1)

How to run, test, package, and verify the Windows AI tutor overlay.

---

## 0. Current state

- Repo: `kashi-reetwal/tutor-overlay`, public, SSH remote.
- Push auth: Git credential store with PAT (non-interactive). SSH also works.
- Platform: Windows first.
- Status: doc brain + Tauri-ready skeleton in progress; app logic to follow.

---

## 1. First-time setup

### 1.1 Prerequisites
- Windows
- Rust toolchain
- Node.js
- Git with credential store configured (so pushes don't prompt)

### 1.2 Get the repo
```bash
git clone git@github.com:kashi-reetwal/tutor-overlay.git
cd tutor-overlay
```

If cloning over HTTPS instead, the credential store should supply the PAT without prompting.

### 1.3 Install frontend deps
```bash
npm install
```

### 1.4 Verify the Rust side knows what it needs
Check `Cargo.toml` and the Rust source layout under `src/main/` before running the app. The first working commit should have a minimal Tauri app that launches.

---

## 2. Run the app

```bash
npm run tauri dev
```

What "works" means at each stage:
- Skeleton stage: the app launches; you can see the window.
- Card stage: the floating card can open and close.
- Hotkey stage: the hotkey registers and the app detects it.
- Capture stage: capture returns an inspectable image.
- AI stage: an answer streams into the card.

Do not mark a stage "done" until the next stage's dependency is intact.

---

## 3. Test capture on your own machine

### 3.1 Basic capture test
1. Open a known window (for example a browser page with obvious text).
2. Invoke the hotkey.
3. Confirm the app captures something inspectable.

If v1 has a debug flag for saving captured frames, use it to look at what the app actually saw.

### 3.2 What to look for
- Real image of the active window in the common case.
- Full-screen fallback behavior if active-window capture fails.
- Blank or blocked frames handled explicitly, not sent to the AI as real content.

### 3.3 Known capture failure modes
- Some content may be blank or blocked.
- DPI/scaling can make the image look wrong if you assume pixels == logical units.
- Some windows may not be capturable in the way you expected.

---

## 4. Test the hotkey

### 4.1 Registration
- Confirm the hotkey registers at startup.
- If registration fails, the app should show a visible warning.

### 4.2 Behavior
- Press the hotkey and confirm the app responds.
- If the hotkey does not fire, check whether another app owns it or whether elevation/context is interfering.

Default hotkey: **Alt+T**.

---

## 5. Test the AI path

### 5.1 Config
AI provider details are env-configured. Before testing, make sure the env is set up so the app can call the provider.

### 5.2 What to test
- The app sends a cropped/downscaled image plus the tutoring prompt.
- The answer streams into the card.
- The answer references what is actually on screen for a known test case.

### 5.3 Bad-answer check
- Use a screenshot where you know what should be said.
- If the model hallucinates content that isn't there, that's a prompt/capture/selection issue, not just a "bad answer."

---

## 6. Package / build

```bash
npm run tauri build
```

Before sharing a build:
1. Make sure the dev build runs and the core loop works.
2. Build the Windows artifact.
3. Run a basic smoke test on the built app: launch, hotkey, capture, answer.
4. Check that the hotkey warning path still works if registration fails.

---

## 7. Sanity checklist before sharing

- [ ] App launches.
- [ ] Hotkey registers or warns if it can't.
- [ ] Capture returns a real image in the common case.
- [ ] Answer streams into the card.
- [ ] Blank/blocked capture does not produce garbage answers.
- [ ] Card opens and closes cleanly.
- [ ] No continuous capture happens by default.
- [ ] No screenshot persistence happens by default unless intended.

---

## 8. Changing the hotkey

For v1, change the hotkey in `tauri.conf.json` (or whichever config path we settle on). In-app hotkey reassignment is not a v1 feature.

After changing it:
- Restart the app.
- Confirm registration.
- Confirm the new hotkey fires.

---

## 9. Changing the AI provider

AI provider is env-configured and intentionally swappable. To change it:
1. Update the env/config as needed.
2. Confirm the request shape still matches what the backend builds.
3. Test with a known screenshot.

---

## 10. Troubleshooting quick checks

- App launches but card doesn't open: check frontend state + the event that opens the card.
- Hotkey doesn't fire: check registration + collision/elevation.
- Capture looks wrong: check DPI/scaling and whether the target is capturable.
- No answer: check AI config, network, request shape, and whether the image was actually sent.
- Weird answer: check whether the model is reading the screen or guessing.
- Build fails: check Rust + Node toolchains and whether the dev build works first.

---

## 11. Cleanup of debug artifacts

If you enable frame-debug saving during capture testing, clean up the `captures/` or debug-frame files before sharing or committing. The `.gitignore` already excludes capture debug output.
