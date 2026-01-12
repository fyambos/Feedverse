import admin from "firebase-admin";

let app: admin.app.App | null = null;

export function initFirebaseAdmin() {
  if (app) return app;

  try {
    // 1) If a JSON service account is provided via env, use it (recommended for CI/hosts)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      let serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

      // Some CI / env setups store the JSON with escaped newlines ("\\n") in
      // the `private_key` field. That produces an invalid JWT signature when
      // used as-is. Normalize by replacing literal backslash-n sequences with
      // real newlines if detected.
      if (serviceAccount && typeof serviceAccount.private_key === 'string' && serviceAccount.private_key.includes('\\n')) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        console.log('Normalized private_key newlines in FIREBASE_SERVICE_ACCOUNT');
      }
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });
      console.log("Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT env");
      return app;
    }

    // 2) If platform provides GOOGLE_APPLICATION_CREDENTIALS, use application default credentials
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      try {
        // Provide clearer diagnostics if the file is missing or unreadable.
        const fs = require('fs');
        if (!fs.existsSync(path)) {
          console.warn(`GOOGLE_APPLICATION_CREDENTIALS is set but file does not exist: ${path}`);
        } else {
          const stat = fs.statSync(path);
          if (!stat.isFile()) console.warn(`GOOGLE_APPLICATION_CREDENTIALS does not point to a regular file: ${path}`);
        }
      } catch (e) {
        // ignore
      }

      app = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log("Firebase Admin initialized using application default credentials");
      return app;
    }

    // Do NOT fall back to a local JSON file in the repository.
    // Require callers to provide credentials via env vars or platform ADC.
    console.warn("Firebase Admin not initialized: no Firebase credentials found in environment variables.");
  } catch (e) {
    // If initialization fails (missing file, env), keep app null and log error.
    console.warn("Firebase Admin not initialized:", (e as Error)?.message ?? e);
    app = null;
  }

  return app;
}

export function getMessaging(): admin.messaging.Messaging | null {
  try {
    if (!app) initFirebaseAdmin();
    return app ? admin.messaging() : null;
  } catch (e) {
    return null;
  }
}
