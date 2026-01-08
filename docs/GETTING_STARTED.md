# Getting Started — Install & Run Feedverse

This document explains how to install, build and run Feedverse locally (backend + mobile). It is aimed at developers and QA testers.

Prerequisites
- Node.js 18+ (use `nvm` to manage versions), currently using v24.12.0
- npm or Yarn
- Git
- For mobile: Expo CLI (`npm install -g expo-cli`)
- A working PostgreSQL-compatible database (Neon, local Postgres, etc.) if you plan to run the backend against a DB

Repository layout
- `backend/` — Node + TypeScript API server
- `mobile/` — Expo (React Native) app
- `tools/` — helper scripts for local development (beta, testing, dev, main)
- `docs/` — project documentation (this file)

Quick clone
```bash
git clone git@github.com:fyambos/Feedverse.git
cd Feedverse
```

Install dependencies
```bash
# Root: small helpers only
npm ci
# Backend
cd backend
npm ci
# Mobile
cd ../mobile
npm ci
```

Environment (Part of the development team? Request the .env file. Other wise, read below)
- Backend reads `backend/.env`. Copy [backend/.env-example](backend/.env-example) and fill required secrets (DB_URL, R2 keys, JWT_SECRET, etc.).
- `EXPO_PUBLIC_API_BASE_URL` in `backend/.env` is used by `tools/testing.js` to launch Expo against a configured URL (for QA against a hosted environment). For local dev, tools set `EXPO_PUBLIC_API_BASE_URL` to your machine IP.


Scripts (quick reference)
- `npm run dev` — runs `tools/dev.js` (ensures branch `dev`) and launches Expo pointing to your machine IP, builds and starts backend in foreground.
- `npm run main` — runs `tools/main.js` (ensures branch `main`) and launches Expo pointing to your machine IP (for now), builds and starts backend in foreground.
- `npm run beta` — runs `tools/beta.js` (ensures branch `beta`) and launches Expo pointing to your machine IP, builds and starts backend in foreground.
- `npm run testing` — runs `tools/testing.js` (ensures branch `testing`) and launches Expo using `EXPO_PUBLIC_API_BASE_URL` from `backend/.env` (used for Railway/Beta QA). Builds and starts backend in foreground.

For more info about these branches, see [tools/README.md](../tools/README.md)

Run backend locally (manual)
```bash
cd backend
# build (TypeScript -> dist)
npm run build:cjs
# then run (shows logs in this terminal)
npm run start
```

Run mobile locally (manual)
```bash
cd mobile
# start expo with cleared cache
npx expo start -c
# set EXPO_PUBLIC_API_BASE_URL env or pass from tools
# e.g. EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:8080 npx expo start -c
```

Notes
- Metro cache: if you see transformer or stale-bundle errors, restart Expo with `-c`.
- Native modules: some features (push notifications, device-specific native modules) require a dev client or production builds. Expo Go may not contain all native modules; the app handles many modules with runtime guards.
- Ports: backend uses port `8080` by default. Ensure nothing else uses that port or change `backend/.env` accordingly.
- Branch rules: do not merge the `testing` branch into `main` or `dev` unless explicitly intended — `testing` is the Beta publish branch.

Troubleshooting
- If `npm run beta`/`testing` fails to open an external terminal, the script falls back to launching Expo in the background. You can then open the `mobile` folder and run `npx expo start -c` manually.
- If backend TypeScript build fails, check `tsconfig.*.json` and run `npm run build:cjs` to surface errors. Fix null-safety issues (common with `res.rowCount`) or missing env vars.

Contributing & creating branches
- Feature branches: create `feature/...` branches from `dev` (or `beta` for Beta-only changes).
- Merge flow: develop in `dev`, merge into `main` for production; for Beta builds use `beta` -> `testing` as described in tools/README.md.

Further docs
- See the project README (root) for concept and high-level details.
- This document is intentionally compact — ask maintainers for additional infra/CI details.
