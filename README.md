# MotionPlay AI

Phone-controlled, single-player 3D bowling with Gemini coaching and a measured motion replay.

## Play

Open https://motionplay-ai.vercel.app on your laptop. Scan its QR code with your phone, tap **Enable motion**, and allow the sensor prompt. Hold anywhere on the phone screen, make a comfortable swing while keeping a firm grip, then release to bowl. Watch the laptop for the result, motion profile and coaching. A game has ten frames; use **New game** or swing again after completion to restart.

Hardware volume buttons are not reliably exposed by mobile browsers. Hold anywhere on the touchscreen is the supported control; volume-key handling works only if your browser delivers those events.

## Run locally

Use Node.js 22.12+ or 24. Install with `npm install`, then run `npm run dev`. Put `GEMINI_API_KEY=your-key` in git-ignored `.env.local`. Run `npm test` and `npm run build` to verify changes. `node scripts/verify-coach.mjs` makes one real Gemini check with synthetic measurements and reports whether Gemini answered.

Phone motion needs HTTPS. Use the deployed URL for real phone testing; ordinary HTTP over your Wi-Fi IP will not enable mobile motion sensors. The phone and laptop talk through a small HTTP long-polling relay on the server (`server/relay.js`), so they do not need to be on the same network.

The last twenty throws remain in the laptop browser's local storage. Swing Lab shows measured angular velocities over normalized time, not a reconstructed 3D arm path. Coaching falls back to a labeled local response if Gemini is unavailable.

## Run on your own server

The relay keeps open connections in memory, so the game needs one long-running Node process (Vercel's serverless functions cannot do this; the Vercel site only serves coaching now).

```
npm install
npm run build
GEMINI_API_KEY=your-key PORT=8080 npm start
```

`npm start` serves the built site, `/api/coach` and `/relay` from one port (Node 22.12+; it also reads `.env.local` if present). Put HTTPS in front of it (Caddy, nginx or a tunnel): phones only expose motion sensors on HTTPS.

## Deployment (Vercel, coaching only)

The Vercel project is `motionplay-ai`. Both Vite entrypoints build into `dist`; `/api/coach` runs as a server function. Set `GEMINI_API_KEY` as a sensitive production environment variable and deploy with `vercel deploy --prod`. The key must never appear in a `VITE_` environment variable or client source. After rotating the key, update `.env.local` and the Vercel production variable, then redeploy.

## Verification status

Automated unit/integration tests and the production build pass. The deployed home/controller return HTTP 200, valid coaching returns Gemini output, and invalid/oversized API requests return HTTP 400. Visual browser verification and real-phone sensor/WebRTC testing remain manual because the browser automation host was unavailable during the implementation session.
