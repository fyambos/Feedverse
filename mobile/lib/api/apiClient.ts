type ApiFetchArgs = {
  path: string;
  token?: string | null;
  init?: RequestInit;
};

type AuthInvalidationHandler = (args: {
  path: string;
  status: number;
  text: string;
  json: any;
}) => void | Promise<void>;

let authInvalidationHandler: AuthInvalidationHandler | null = null;

export function setAuthInvalidationHandler(handler: AuthInvalidationHandler | null) {
  authInvalidationHandler = handler;
}

function isInvalidTokenResponse(status: number, text: string, json: any): boolean {
  if (status === 401) return true;
  if (status !== 403) return false;

  const t = String(text ?? "").toLowerCase();
  const jErr = typeof json?.error === "string" ? String(json.error).toLowerCase() : "";
  const jMsg = typeof json?.message === "string" ? String(json.message).toLowerCase() : "";

  // Backend authMiddleware sends 403 with a plain-text French message when the JWT is invalid.
  // We only want to treat *that* case as session invalidation; many endpoints use 403 for "Not allowed".
  const needles = [
    "token de connexion invalide",
    "invalide ou expiré",
    "invalid or expired authentication token",
    "invalid or expired",
    "invalid token",
    "jwt",
  ];

  return needles.some((n) => t.includes(n) || jErr.includes(n) || jMsg.includes(n));
}

function apiBaseUrl() {
  const raw = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
  return raw.replace(/\/$/, "");
}

export async function apiFetch({ path, token, init }: ApiFetchArgs) {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");

  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init?.headers ?? undefined);

  // If body is FormData, let fetch set the correct multipart boundary.
  const isFormDataBody =
    typeof FormData !== "undefined" &&
    !!init?.body &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (init.body as any) instanceof FormData;

  if (!isFormDataBody && !headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network request failed";
    return {
      ok: false,
      status: 0,
      json: null,
      text: msg,
    };
  }

  const text = await res.text();
  const json = (() => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  })();

  // Global auth invalidation:
  // - 401 always means the session is invalid.
  // - 403 can mean either "token invalid" or "not allowed"; only invalidate
  //   when the response clearly indicates an invalid/expired token.
  // Avoid triggering this for unauthenticated calls (no token) and for /auth/* endpoints.
  if (token && isInvalidTokenResponse(res.status, text, json)) {
    const p = String(path ?? "");
    const isAuthRoute = /^\/?auth\b/i.test(p);
    if (!isAuthRoute && typeof authInvalidationHandler === "function") {
      try {
        await authInvalidationHandler({ path: p, status: res.status, text, json });
      } catch {
        // best-effort; never block callers
      }
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    json,
    text,
  };
}
