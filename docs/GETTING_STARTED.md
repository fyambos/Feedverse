# Getting Started — Install & Run Feedverse Beta

This document explains how to install, build and run the beta of Feedverse locally (backend + mobile). It is aimed at developers and QA testers.

### Prerequisites
- **Node.js 24+** (node -v to check if installed) use `nvm` to manage versions, currently using v24.12.0
- **npm 10+** (npm -v to check if installed), currently using v11.6.2
- **Git** (git -v to check if installed)
- **Expo CLI** (open a terminal and do `npm install -g expo-cli`)
- A working **PostgreSQL-compatible database** (Neon, local Postgres, etc.) if you plan to run the backend against a DB.
- **Android Studio** (if you want to test on an emulator)
- **Xcode** (if you're on mac and want to test on an emulator)
### Repository layout
- `backend/` — Node + TypeScript API server
- `mobile/` — Expo (React Native) app
- `tools/` — helper scripts for local development (beta, testing, dev, main)
- `docs/` — project documentation (this file)

The branches containing the beta are the branches `beta` and `testing`. `beta` being the development branch of the Beta, and `testing` being the deployed Beta (on iOS and Android). Any changes must be done in `beta` and merged into `testing` when ready for deployment. The other two branches, `main` and `dev` have nothing to do with the Beta, they're the final product (currently developping).

### Quick clone
```bash
git clone https://github.com/fyambos/Feedverse/
cd Feedverse
git checkout beta
```

If you want to test the stable version of the beta instead `git checkout testing`.

### Install dependencies
```bash
# Backend
cd backend
npm i
# Mobile
cd ../mobile
npm i
```

### Environment (Part of the development team? Request the .env file. Other wise, read below)
- Backend reads `backend/.env`. Copy [backend/.env-example](backend/.env-example) and fill required secrets (DB_URL, R2 keys, JWT_SECRET, etc.).
- `EXPO_PUBLIC_API_BASE_URL` in `backend/.env` is used by `tools/testing.js` to launch Expo against a configured URL (for QA against a hosted environment). For local dev, tools set `EXPO_PUBLIC_API_BASE_URL` to your machine IP.


### Secret keys

#### Firebase admin SDK private key
To generate a private key file for your service account:
- Create a new Firebase project inside the [Firebase console](https://console.firebase.google.com/u/0/).
- Click on the gear icon next to 'Project overview' in your newly created project and go in Project Settings.
- Click on the Service Accounts tab.
- Click Generate New Private Key, then confirm by clicking Generate Key.
- Securely store the JSON file containing the key (out of the repo).
- EITHER Create a compact single line service account with `jq -c . /absolute/path/to/feedverse_sa_KEY.json` and paste the output and put it into FIREBASE_SERVICE_ACCOUNT in the .env file as a string.
- OR you can run `export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/feedverse_sa_KEY.json` to put it in the console's environment variables.

#### Google Services Key (if you are part of the dev team, request the file instead)
- Still in the settings, go to the General tab.
- Download the file from there and put it in /mobile.

### Run backend
```bash
cd backend
# build (TypeScript -> dist)
npm run build:cjs && npm test
# then run
npm run start
```

### Run mobile
In another terminal
```bash
cd mobile
# start expo with cleared cache and your current adress ip
EXPO_PUBLIC_API_BASE_URL=[your address ip]:8080 npx expo start -c
# e.g. EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:8080 npx expo start -c
```

### Launch on an android simulator
- Open Android Studio
- Click on Device Manager
- Create a new Device
- In the EXPO terminal press "s" to turn on Expo Go mode, then "a" to launch on Android.

### Launch on iOS simulator
- Open XCode
- In the EXPO terminal press "s" to turn on Expo Go mode, then "i" to launch on iOS.

### Notes
- Native modules: some features (push notifications, device-specific native modules) require a dev client or production builds. Expo Go may not contain all native modules; the app handles many modules with runtime guards.
- Ports: backend uses port `8080` by default. Ensure nothing else uses that port or change `backend/.env` accordingly.
- Branch rules: do not merge the `beta`or `testing` branches into `main` or `dev` — `testing` is the Beta publish branch. `beta`is the dev branch of the Beta, merges into `testing`.

### Health checks (local)
Once the backend is running on port 8080:

```bash
curl -sS http://localhost:8080/healthz
curl -i  http://localhost:8080/readyz
```

### Troubleshooting
- If backend TypeScript build fails, check `tsconfig.*.json` and run `npm run build:cjs` to surface errors.

### Contributing & creating branches
- Feature branches: create `feature/...` branches from `dev` (or `beta` for Beta-only changes).
- Merge flow: develop in `dev`, merge into `main` for production; for Beta builds use `beta` -> `testing` as described in [tools/README.md](../tools/README.md).

### Further docs
- See the project [README.md](/README.md) for concept and high-level details.
- This document is intentionally compact — find more details in the [Wiki](https://github.com/fyambos/Feedverse/wiki).
