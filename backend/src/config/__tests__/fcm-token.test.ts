/* eslint-disable @typescript-eslint/no-var-requires */
import fs from 'fs';

const {JWT} = require('google-auth-library');

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './path/to/key.json';

function loadServiceAccountFromEnv(): any | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const rawB64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      // maybe it's base64 or a compact string with escaped newlines
      try {
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        return JSON.parse(decoded);
      } catch (e2) {
        // try replacing escaped newlines
        try {
          return JSON.parse(raw.replace(/\\n/g, '\n'));
        } catch (e3) {
          // Helpful hint without logging secrets.
          console.warn(
            'FIREBASE_SERVICE_ACCOUNT is set but could not be parsed as JSON. ' +
              'Use FIREBASE_SERVICE_ACCOUNT_B64 (base64-encoded JSON) or ensure the value is valid JSON with \\n escapes inside private_key.'
          );
          return null;
        }
      }
    }
  }

  if (rawB64) {
    try {
      const decoded = Buffer.from(rawB64, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (e) {
      return null;
    }
  }

  return null;
}

describe('FCM service account token', () => {
  jest.setTimeout(20000);

  test('can obtain OAuth token when service account key is present', async () => {
    // Prefer FIREBASE_SERVICE_ACCOUNT (or FIREBASE_SERVICE_ACCOUNT_B64) from env.
    const envKey = loadServiceAccountFromEnv();
    let key: any = null;

    if (envKey) {
      key = envKey;
    } else if (fs.existsSync(keyPath)) {
      key = require(keyPath);
    } else {
      console.warn(`Skipping FCM token test; no service account found in FIREBASE_SERVICE_ACCOUNT or at ${keyPath}`);
      return;
    }
    const client = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });

    const tokens = await new Promise((resolve, reject) => {
      client.authorize((err: any, tokens: any) => {
        if (err) return reject(err);
        resolve(tokens);
      });
    });

    expect(tokens).toBeDefined();
    // tokens shape may vary by library version; require at least one token field
    expect((tokens as any).access_token || (tokens as any).token).toBeTruthy();
  });
});
