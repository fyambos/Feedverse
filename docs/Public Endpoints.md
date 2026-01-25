# Public Endpoints

This document lists endpoints that are intentionally accessible without authentication.

If an endpoint is not listed here, it should be treated as **authenticated** by default.

## Health

- `GET /healthz`
  - Liveness-style check.
  - Always returns `200` if the API process is running.
  - Includes a best-effort DB ping result in the JSON payload.

- `GET /readyz`
  - Readiness check.
  - Returns `200` only when the DB ping succeeds, otherwise `503`.

Notes:
- These endpoints are unauthenticated to support load balancers / orchestrators.
- They are excluded from rate limiting.

## Authentication

Mounted under `/auth`.

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`

Notes:
- `POST /auth/logout` and `GET /auth/protected` require authentication.
