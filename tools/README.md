Usage
-----

Start backend (build + run) and Expo pointing to a configured URL with one command.

Run one of the commands from the repository root (`feedverse/`):

- `npm run dev` — start the app for local development (branch: `dev`).
- `npm run main` — start the app for production branch, testing locally for now (branch: `main`).
- `npm run beta` — start the Beta development flow (branch: `beta`).
- `npm run testing` — start the Beta publish branch flow; uses `EXPO_PUBLIC_API_BASE_URL` from `backend/.env` (branch: `testing`).

What it does
- Detects your local IP (IPv4) automatically for `dev`, `beta`, `main` flows.
- Builds the backend CJS bundle (`npm run build:cjs` in `backend`).
- Starts the backend in foreground so logs are visible.
- Starts Expo in a new terminal with `EXPO_PUBLIC_API_BASE_URL` set to the detected or configured URL and clears Metro cache (`-c`).

Notes
- Used `--host lan` as well so a device on the same network can connect to the Expo dev server.

What are these branches

- **MVP / GA (initial MVP and final app — General Availability):**
	- `main`: production branch
	- `dev`: development branch (merge into `main` when ready for production)

- **Beta:**
	- `testing`: primary Beta branch; builds are published to iOS and Android. Its code diverges from `main` and will be dropped once the final app is completed.
	- `beta`: development branch for the Beta; merge into `testing` when ready for Beta builds and shipping them to iOS and Android.
