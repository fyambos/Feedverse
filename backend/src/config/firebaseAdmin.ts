import admin from "firebase-admin";
import path from "path";

let app: admin.app.App | null = null;

export function initFirebaseAdmin() {
  if (app) return app;

  try {
    // Service account file path (kept out of git)
    const keyPath = path.join(__dirname, "..", "..", "feedverse-510bc-firebase-adminsdk-fbsvc-c067f69184.json");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serviceAccount = require(keyPath);

    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
    console.log("Firebase Admin initialized");
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
