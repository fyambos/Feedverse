# EAS Push Notification Setup (condensed)

This guide walks through the minimal steps to enable system push notifications for the `feedverse` app using FCM (Android) and APNs (iOS) and how to build with EAS.

1) Install tooling

```bash
# Install EAS CLI globally
npm install -g eas-cli

# From the mobile folder, add the notifications package
cd mobile
expo install expo-notifications
```

2) Android — Firebase (FCM)

- Create a Firebase project at https://console.firebase.google.com
- Add an Android app using your `android.package` (bundle id from your `app.json`).
- Download `google-services.json` and place it at the project root (repo root) or where you prefer; we'll reference it from `app.json`.

Add to `app.json` (example snippet inside `expo`):

```json
"android": {
  "package": "com.yourcompany.yourapp",
  "googleServicesFile": "./google-services.json"
}
```

- For sending remote pushes from your server, get the Server key (or new FCM key) from Firebase Project Settings -> Cloud Messaging.

3) iOS — APNs

- Prefer an **APNs Auth Key (.p8)** (recommended by Apple) instead of certificates.

Step-by-step:

1. Apple Developer → **Certificates, Identifiers & Profiles**
2. **Keys** → “+”
3. Name it (ex: `Feedverse Push`)
4. Enable **Apple Push Notifications service (APNs)**
5. Download the `.p8` file (only downloadable once)
6. Note your:
  - **Key ID** (ex: `ABC123DEFG`)
  - **Team ID** (from your Apple Developer account)
7. Ensure `ios.bundleIdentifier` in `mobile/app.json` matches the App ID you’ll use.

EAS integration:

- If you run `eas build -p ios`, EAS can manage credentials for you.
- If you want to upload manually, use `eas credentials` and provide the APNs key when prompted.

Common failure modes:

- Bundle identifier mismatch (build succeeds but pushes never arrive)
- Wrong Team ID / Key ID
- Using an expired/incorrect provisioning profile for the push environment

4) `app.json` / config changes (example `expo` root section)

```json
{
  "expo": {
    "name": "Feedverse",
    "slug": "feedverse",
    "platforms": ["ios","android"],
    "ios": {
      "bundleIdentifier": "com.yourcompany.yourapp"
    },
    "android": {
      "package": "com.yourcompany.yourapp",
      "googleServicesFile": "./google-services.json"
    }
  }
}
```

5) `eas.json` (example) — create at repo root

```json
{
  "cli": { "version": ">= 3.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "ios": {}
    }
  }
}
```

6) Upload credentials / run builds

- If you haven't logged into EAS locally:

```bash
eas login
```

- Build development client (fast local testing with native modules):

```bash
# Android dev build
eas build -p android --profile development
# iOS dev build (requires Apple credentials)
eas build -p ios --profile development
```

- Production builds:

```bash
eas build -p android --profile production
eas build -p ios --profile production
```

EAS will prompt to manage or upload credentials (upload `google-services.json`, APNs key `.p8`). Follow prompts.

7) Server-side push keys

- Android: use FCM HTTP v1 credentials (service account JSON) when sending directly.
- iOS: APNs key (.p8) is handled by EAS/Expo push pipeline when using Expo push tokens.

Delivery behavior in this repo:

- Push sends are **best-effort** and should never crash API requests.
- Transient failures are retried a few times with backoff.

8) App runtime (already added to code):

- Request permissions at runtime with `expo-notifications`.
- Set `Notification.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true }) })`.
- Add `addNotificationResponseReceivedListener` to deep-link using `data.conversationId`.
- Keep the in-app banner as a fallback (works in Expo Go/emulator).