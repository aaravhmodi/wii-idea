# MotionPlay AI — staged build plan with agent swarm

## Context

The project folder is empty. The goal is a hackathon demo for the Google DeepMind challenge: a phone becomes a motion controller for an original 3D bowling game on a laptop screen, and Gemini coaches the player after every throw.

Decisions made with the user:

- **Scope: core demo.** Phone-controlled bowling, Gemini swing analysis per throw, visual swing replay against your best throw, trend coaching over the last 20 throws.
- **Hosting: Vercel.** Static site plus one serverless function that holds the Gemini key.
- **Gemini key:** supplied in chat, to be rotated. It goes only into `.env.local` (git-ignored) and the Vercel env var `GEMINI_API_KEY`. It is never written into source, the plan, or agent prompts.

Left out on purpose (add later if wanted): custom control calibration, Gemini Live voice coach, video analysis, generated arenas, tennis.

## Design

**Stack:** Vite (plain JS), `three` (rendering), `cannon-es` (pin physics), `peerjs` (phone to laptop over WebRTC, so no socket server is needed on Vercel), `qrcode` (pairing code), `vitest` (tests).

**Flow:**

1. Laptop opens `/` and shows a QR code. Phone scans it and opens `/controller.html?room=<id>`.
2. Phone: hold the big button, swing, release the button to let go of the ball. Recording only while the button is held makes swing detection trivial and reliable. The phone sends one `swing` message with about 1 to 2 seconds of raw samples.
3. Laptop computes swing features locally (deterministic, no AI): duration, peak acceleration, peak rotation speed, wrist twist amount, when in the swing the twist happened, smoothness.
4. Features map to ball speed, direction and hook. The ball rolls; physics decides the pins.
5. Laptop posts features + result + stats of the last 20 throws to `/api/coach`. Gemini returns structured JSON: one insight, one tip, a consistency score.
6. Swing Lab panel shows the measured motion profile over the best throw's profile, three stat tiles, and the Gemini insight. Labelled as a motion profile, not a 3D reconstruction, because a phone cannot give true arm position.

**Shared contract** (`src/shared/contract.js`, written before any agent starts so parallel work fits together):

- `Sample`: `{t, ax, ay, az, rx, ry, rz}` (acceleration and rotation rate)
- `SwingMsg`: `{type:'swing', samples: Sample[]}`
- `Features`: `{durationMs, peakAccel, peakRot, twistDeg, twistTiming, smoothness}`
- `ThrowParams`: `{speed, angle, spin}`
- `ThrowResult`: `{pinsDown, frame, roll, strike, spare}`
- `CoachReply`: `{insight, tip, consistency}`

## Stages

### Stage 0 — Scaffold (lead, sequential)

- `git init`, Vite project, install deps, `.gitignore` (includes `.env.local`), `vite.config.js` with two pages (`index.html`, `controller.html`).
- Write `src/shared/contract.js` and `fixtures/swings.json` (a few synthetic swings: straight, early twist, slow, fast) so agents can build and test without a phone.
- Write `.env.local` with the key. Run the user's curl example once to confirm the key works. The call shape is fixed by that example: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`, key in the `X-goog-api-key` header, body `{contents:[{parts:[{text}]}]}`. No SDK needed, plain `fetch`.

### Stage 1 — Build (4 subagents in parallel, each owns separate files)

| Agent | Job | Owns |
|---|---|---|
| **Controller** | Phone page: motion permission prompt (needed on iPhone), hold-to-swing button, sample capture, vibration on release. PeerJS wrapper with `host()` and `join(room)`. QR code on the laptop. Reconnect message if the link drops. | `controller.html`, `src/controller/`, `src/net.js` |
| **Game** | Original bowling lane, ball and 10 pins with three + cannon-es. `throwBall(ThrowParams) → Promise<ThrowResult>`. Standard 10-frame scoring with a unit test. Keyboard throw for debugging. | `src/game/` |
| **Motion** | Pure `extractFeatures(samples)` and `toThrowParams(features)` with vitest tests against the fixtures. Swing Lab panel: canvas profile overlay (measured vs best) and stat tiles. | `src/motion/`, `src/ui/swinglab.js` |
| **Coach** | `api/coach.js` serverless function: validates and size-caps the body, calls `gemini-flash-latest` via `fetch` (shape from the user's curl example) with a JSON response schema, returns `CoachReply`. Client `getCoaching()`. Last-20 history in `localStorage` and deterministic trend stats (for example accuracy vs swing speed). Canned fallback reply if Gemini fails so the demo never stalls. | `api/`, `src/coach/` |

Each agent gets the contract file, its file ownership, and the instruction to touch nothing else and to finish with its tests passing.

### Stage 2 — Integrate (lead, sequential)

- `index.html` + `src/main.js`: wire net → features → throw → result → coach → Swing Lab. Target about 60 lines of glue.
- Run `npm run build` and `npm test`. Fix seams between agents.

### Stage 3 — Verify (1 review subagent + lead)

- Review subagent: reads the whole repo for bugs at the seams, key leakage, and the iPhone permission path. Reports only; lead applies fixes.
- Lead: run the dev server, open the laptop page in Chrome, inject fixture swings through the same handler the phone uses, confirm ball rolls, score updates, Swing Lab draws, and a real Gemini reply appears.

### Stage 4 — Deploy

- `vercel` deploy, set `GEMINI_API_KEY` in Vercel, open the HTTPS link.
- User tests with a real phone (the only step that cannot be automated) and reports how the throw feels; lead tunes the mapping constants in `src/motion/mapping.js`.
- `graphify update .` to refresh the knowledge graph.

## Verification

- `npm test`: feature extraction, mapping, scoring, trend stats.
- `npm run build` passes.
- Browser run with fixture swings: full loop including a live Gemini response.
- `curl` to deployed `/api/coach` with a fixture body returns valid `CoachReply`; an oversized or malformed body returns 400.
- Real phone on the Vercel URL: pair by QR, throw, see coaching.

## Risks

- Swing-to-ball mapping constants are guesses until a real phone is used.
- PeerJS relies on its free public signalling server; if it is down at demo time pairing fails. Fallback is a self-hosted PeerServer, not built now.
- The key was shared in chat; rotate it after the hackathon and update `.env.local` and Vercel.

## Progress (updated 2026-11-14)

- [x] Stage 0: scaffold and synthetic swing fixtures.
- [x] Stage 1: coach, motion/Swing Lab, controller and game modules completed through coordinated Codex and Claude agents (see SWARM.md).
- [x] Stage 2: laptop integration, new-game restart, asynchronous coaching, reconnection fixes. All 36 tests and production build pass.
- [ ] Stage 3: code and integration reviews complete; live Gemini verified locally and in production. Browser automation unavailable (browser host and native helper unavailable); visual fixture replay and real-phone sensor/WebRTC verification remain manual.
- [x] Stage 4 deployment: https://motionplay-ai.vercel.app. Replacement Gemini key stored locally and as a sensitive Vercel production variable. Both pages return 200, real Gemini coaching works, malformed/oversized bodies return 400. Graphify updated (203 nodes, 348 edges).
- [ ] Real phone: open deployed page on laptop, scan QR, enable motion, hold anywhere on touchscreen and release to bowl. Tune mapping only after actual phone feedback.

Claude hit its usage limit after controller and initial integration work; Codex completed remaining fixes, verification and deployment. No commits or pushes were made by Codex.
