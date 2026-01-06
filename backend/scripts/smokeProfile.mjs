#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL || process.env.API_BASE_URL || 'http://localhost:8080';

function usage() {
  console.log('Usage: node scripts/smokeProfile.mjs <identifier> <password> [scenarioId]');
  console.log('Env:   SMOKE_BASE_URL=http://localhost:8080');
}

function truncate(str, max = 500) {
  if (typeof str !== 'string') return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + '…';
}

async function readBodyText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function requestJson(path, { method = 'GET', token, body } = {}) {
  if (typeof fetch !== 'function') {
    throw new Error('Node fetch() is not available. Please use Node 18+');
  }

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await readBodyText(res);
    throw new Error(`${method} ${path} -> ${res.status} ${res.statusText}${text ? `\n${truncate(text)}` : ''}`);
  }

  const text = await readBodyText(res);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main() {
  const [, , identifier, password, scenarioIdArg] = process.argv;

  if (!identifier || !password) {
    usage();
    process.exitCode = 2;
    return;
  }

  // 1) Login
  const login = await requestJson('/auth/login', {
    method: 'POST',
    body: { identifier, password_hash: password },
  });

  const token = login?.token;
  if (!token || typeof token !== 'string') {
    throw new Error('Login succeeded but no token returned');
  }

  // 2) Choose scenario
  let scenarioId = scenarioIdArg;
  if (!scenarioId) {
    const scenarios = await requestJson('/scenarios', { token });
    scenarioId = Array.isArray(scenarios) && scenarios[0]?.id ? scenarios[0].id : undefined;
  }
  if (!scenarioId) {
    throw new Error('No scenario id found. Pass one as arg #3.');
  }

  // 3) Create a profile
  const now = Date.now();
  const handle = `smoke_${now}`;
  const created = await requestJson(`/scenarios/${encodeURIComponent(scenarioId)}/profiles`, {
    method: 'POST',
    token,
    body: {
      displayName: `Smoke ${now}`,
      handle,
      isPublic: true,
      isPrivate: false,
    },
  });

  const profileId = created?.id;

  // 4) Verify count (small)
  const profiles = await requestJson(`/scenarios/${encodeURIComponent(scenarioId)}/profiles`, { token });
  const count = Array.isArray(profiles) ? profiles.length : null;

  console.log(`token_len=${token.length}`);
  console.log(`scenario_id=${scenarioId}`);
  console.log(`profile_id=${profileId ?? 'unknown'}`);
  console.log(`profiles_count=${count ?? 'unknown'}`);
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exitCode = 1;
});
