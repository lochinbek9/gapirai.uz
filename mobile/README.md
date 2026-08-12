# GapirAI Mobile

React Native + Expo client for GapirAI.uz. This app is a **client only** — it talks to the existing
FastAPI backend in [`../backend`](../backend) over HTTP. It does not run any AI model, FFmpeg pipeline,
Whisper transcription, or hold any backend secret (OpenAI/AWS/Click/Telegram/Resend keys stay server-side).

See [`../MOBILE_INTEGRATION_AUDIT.md`](../MOBILE_INTEGRATION_AUDIT.md) for the authoritative map of what
the backend actually supports — endpoints, auth flow, job statuses, and known gaps (no analysis-history
endpoint, no push notifications). Treat it as ground truth over any assumption made in code comments.

## Status

**Phase 1 — Foundation.** Routing, theming, the API client, TanStack Query, and secure token storage are
wired up. There is no login, dubbing, or analysis UI yet — the single screen at `/` just confirms the
foundation boots and shows the resolved API URL.

## Requirements

- Node.js 20+ (this project was built against Node 22)
- npm
- [Expo Go](https://expo.dev/go) app on a physical device, **or** Xcode (iOS Simulator) / Android
  Studio (Android Emulator) for local simulators
- The backend running locally if you want the app to talk to something — see `../backend/README` /
  `../DEPLOYMENT.md` for how to run it, or point `EXPO_PUBLIC_API_URL` at a deployed instance

## Getting started

```bash
cd mobile
npm install
npm run start
```

This opens the Expo CLI dev server. From there:

- Press `a` to open in a connected Android emulator/device
- Press `i` to open in the iOS Simulator (macOS + Xcode only)
- Scan the QR code with Expo Go on a physical device

## Environment configuration

The backend base URL is controlled by `EXPO_PUBLIC_API_URL` (see `src/config/env.ts`). Copy `.env.example`
to `.env` and set it explicitly when testing against anything other than a local backend on the default
port:

```bash
cp .env.example .env
```

If `EXPO_PUBLIC_API_URL` is unset, the app falls back to:

| Environment      | Platform         | Resolved URL                                                                                                                                   |
| ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Dev (`__DEV__`)  | iOS Simulator    | `http://localhost:8000`                                                                                                                        |
| Dev (`__DEV__`)  | Android Emulator | `http://10.0.2.2:8000` (Android's alias for the host machine's `localhost`)                                                                    |
| Dev (`__DEV__`)  | Physical device  | Neither works — a physical device is not the host machine. Set `EXPO_PUBLIC_API_URL` to your machine's LAN IP, e.g. `http://192.168.1.23:8000` |
| Production build | any              | `https://api.gapirai.uz`                                                                                                                       |

Never put secrets in `EXPO_PUBLIC_*` variables — Expo inlines them into the JS bundle at build time, so
they ship to every device that installs the app.

## Project structure

```
mobile/
├── app/                  Expo Router routes (file-based). One screen today: index.tsx.
├── src/
│   ├── api/              Centralized HTTP layer: axios client, TanStack Query client, token storage.
│   ├── components/       Theme-aware primitives (ThemedView, ThemedText). No feature UI yet.
│   ├── config/           Environment resolution (env.ts).
│   ├── store/            Zustand stores — only where genuinely global client state is needed.
│   └── theme/            Design tokens (mirrors frontend/app/globals.css) + ThemeProvider.
├── assets/                App icons/splash (placeholder — real branding assets come before release).
├── app.json               Expo config: name, bundle identifiers, scheme, expo-router plugin.
├── eslint.config.js        eslint-config-expo (flat config) + eslint-config-prettier.
└── .prettierrc.json
```

Feature folders (`src/features/auth`, `.../dubbing`, `.../analysis`, `.../video`, `.../settings`) are
intentionally **not** created yet — they land in the phases that actually implement those features
(Phase 2+), so there's no empty scaffolding to go stale.

## Available scripts

| Script                 | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `npm run start`        | Start the Expo dev server                                 |
| `npm run android`      | Start the dev server and open on Android                  |
| `npm run ios`          | Start the dev server and open on iOS                      |
| `npm run lint`         | ESLint (`expo lint`)                                      |
| `npm run typecheck`    | `tsc --noEmit`                                            |
| `npm run format`       | Prettier — write                                          |
| `npm run format:check` | Prettier — check only (CI)                                |
| `npm run doctor`       | `expo-doctor` — validates the Expo config/dependency tree |

## Known constraints carried over from the backend audit

- **Auth**: JWT bearer, 7-day expiry, **no refresh token, no logout endpoint**. Login is a 2-step
  OTP-by-email flow (`POST /auth/login` sends the code, `POST /auth/verify-code` returns the JWT) — not a
  single-call login. Do not build a refresh-token or server-side-logout flow; there is nothing to call.
- **Dubbing** works anonymously (create job, poll, watch, download need no auth); job **history**
  (`GET /api/jobs`) requires login.
- **Video Analysis** is fully auth + ownership gated, and has **no list/history endpoint** — an Analysis
  library screen cannot be built against the current backend.
- **No push notification infrastructure** exists server-side.

None of the above are mobile bugs to fix — they're backend constraints the client must design around.
