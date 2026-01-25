*Mise à jour:* 25 Janvier 2026.

# Feedverse — Engineering Notes (Backend + Mobile)

Ce document résume les conventions techniques et les choix d’architecture.

## 1) Stack (high level)

- **Backend**: Node.js + TypeScript + Express, PostgreSQL (`pg` Pool)
- **Mobile**: Expo / React Native + TypeScript (expo-router)
- **Validation**: Zod (schémas + `safeParse`) via middleware
- **Observabilité**: Pino (logs structurés) + optionnel Sentry
- **Realtime**: SSE + WebSocket (`ws`)
- **Push notifications**: Expo Push API (tokens Expo) + EAS (APNs/FCM)
- **Uploads**: Multer + Cloudflare R2

## 2) Backend — architecture & conventions

### 2.1 Entrée, routes, versioning

- L’app Express est construite dans [backend/src/app.ts](../backend/src/app.ts).
- Les routes sont montées deux fois :
  - **Non versionnées** (chemins actuels), ex: `/scenarios`
  - **Versionnées** sous `/v1`, ex: `/v1/scenarios`
- L’API ajoute un header sur toutes les réponses :
  - `X-API-Version: 1`

Objectif : permettre un chemin de migration non cassant (introduire des changements dans `/v1` puis migrer le client progressivement si besoin).

### 2.2 Request IDs (`x-request-id`)

Le backend attache un `requestId` à chaque requête et le renvoie dans la réponse :

- Requête: vous pouvez fournir `x-request-id` (optionnel)
- Réponse: `x-request-id` est renvoyé (toujours)
- Les réponses d’erreur incluent `requestId` dans le JSON

Implémenté dans [backend/src/middleware/requestMiddleware.ts](../backend/src/middleware/requestMiddleware.ts).

### 2.3 Standard d’erreurs JSON

Les erreurs “standardisées” (404 + middleware d’erreur final) suivent cette forme :

```json
{
  "ok": false,
  "status": 400,
  "error": "Invalid request",
  "path": "/scenarios/...",
  "requestId": "...",
  "details": { "issues": [ ... ] }
}
```

- `details` est optionnel.
- Les détails internes ne doivent pas fuiter : on log côté serveur, et on renvoie un message safe côté client.

Voir [backend/src/middleware/errorMiddleware.ts](../backend/src/middleware/errorMiddleware.ts) et le helper [backend/src/lib/apiResponses.ts](../backend/src/lib/apiResponses.ts).

### 2.4 Validation des inputs (Zod)

Le backend utilise Zod pour valider/coercer les inputs :

- `validateBody(schema)`
- `validateQuery(schema)`
- `validateParams(schema)`

En cas d’échec, on renvoie un `HttpError(400, "Invalid request", { issues: ... })`.

Voir [backend/src/middleware/validationMiddleware.ts](../backend/src/middleware/validationMiddleware.ts).

Note : Express 5 peut rendre `req.query` non assignable, donc le middleware stocke le résultat dans `(req as any).validatedQuery` au besoin.

### 2.5 Pagination (curseur)

Conventions :

- Le curseur est un string opaque côté client.
- Format courant : `${timestampIso}|${id}`

Helpers génériques : [backend/src/lib/pagination.ts](../backend/src/lib/pagination.ts)

#### Posts
- Les endpoints de posts utilisent `cursor` + `limit`.
- Réponse paginée :
  - `{ items: Post[], nextCursor: string | null }`

#### Messages
- `GET /conversations/:conversationId/messages`
  - Query: `limit` (1..200), `cursor` (format `${createdAtIso}|${id}`)
  - Réponse: `{ items: Message[], nextCursor: string | null }`

Implémentation: [backend/src/messages/messageRepositories.ts](../backend/src/messages/messageRepositories.ts)

### 2.6 Méthode HTTP non autorisée (405)

Certaines routes exposent explicitement un `405 Method Not Allowed` (plutôt qu’un `400`).

- Constante: `HTTP_STATUS.METHOD_NOT_ALLOWED = 405`
- Helper: `sendMethodNotAllowed(req, res)` dans [backend/src/lib/apiResponses.ts](../backend/src/lib/apiResponses.ts)

### 2.7 Health checks

Endpoints publics (sans auth) :

- `GET /healthz` : liveness (process OK) + ping DB best-effort
- `GET /readyz` : readiness (200 seulement si ping DB OK, sinon 503)

Code: [backend/src/app.ts](../backend/src/app.ts)
Doc: [docs/Public Endpoints.md](Public%20Endpoints.md)

Exemples :

```bash
curl -sS http://localhost:8080/healthz | jq
curl -i  http://localhost:8080/readyz
```

### 2.8 Observabilité

- Logs structurés Pino + middleware HTTP (pino-http)
- Sentry (optionnel) : request handler + tracing + error handler

Code: [backend/src/middleware/observabilityMiddleware.ts](../backend/src/middleware/observabilityMiddleware.ts)

### 2.9 Sécurité (base)

- `helmet` + CORS
- Rate limiting (avec exception pour `/healthz` et `/readyz`)
- Support reverse-proxy: `TRUST_PROXY=1` pour que les IPs client soient correctes

Code: [backend/src/middleware/securityMiddleware.ts](../backend/src/middleware/securityMiddleware.ts)

### 2.10 Realtime (SSE + WebSocket)

- SSE: endpoints dans `backend/src/realtime/*`
- WS: serveur `ws` attaché au serveur HTTP
  - Auth JWT
  - Limitations (par IP, par user, par scenario)
  - Heartbeat + timeouts

Code: [backend/src/realtime/websocketService.ts](../backend/src/realtime/websocketService.ts)

### 2.11 Push notifications (Expo)

- Le backend stocke/consomme des Expo push tokens.
- Envoi via Expo Push API : batch (<=100) + retry/backoff sur erreurs transitoires.

Code: [backend/src/push/expoPush.ts](../backend/src/push/expoPush.ts)
Doc setup: [docs/EAS_PUSH_SETUP.md](EAS_PUSH_SETUP.md)

## 3) Mobile — architecture & perf

### 3.1 App structure

- Expo Router (routes dans `mobile/app/*`)
- `EXPO_PUBLIC_API_BASE_URL` configure l’URL backend.

### 3.2 Client API & compat

- Le client doit tolérer certaines variations de réponse durant les migrations (ex: pagination messages).
- Stratégie recommandée : lire `items` si présent, sinon fallback sur `messages`/legacy.

### 3.3 SQLite (cache local)

- `expo-sqlite`
- Tables + indexes créés dans :
  - `mobile/data/db/sqliteStore.ts`
  - `mobile/data/db/storage.ts`
- Pragmas de perf (WAL, `synchronous`, `temp_store`) + `PRAGMA optimize` après init.

### 3.4 Optimisations UI (perf)

- `React.memo` sur les cartes de post (réduit les re-renders dans les feeds)
  - `MemoPost` dans `mobile/components/post/Post.tsx`
- Lazy loading de composants lourds sur l’écran de création de post
  - `React.lazy` + `Suspense` dans `mobile/app/modal/create-post.tsx`

## 4) Vérifications rapides (checklist)

Backend
- `curl -sS http://localhost:8080/healthz`
- `curl -i  http://localhost:8080/readyz`

Mobile
- `npx tsc -p tsconfig.json --noEmit`
- `npm run lint`

## 5) Déploiement — notes (pratiques)

- Définir `TRUST_PROXY=1` derrière un proxy (Railway/Render/Nginx)
- Monitorer DB connections + pool
- Activer backups/restores (surtout si auto-host Postgres)

### 5.1 Hébergement (DigitalOcean) — options & migration

Deux approches courantes sur DigitalOcean :

- **App Platform + Managed PostgreSQL** : le plus simple (TLS, backups, monitoring).
- **Droplet (VM) + Postgres self-host** : moins cher parfois, mais vous gérez tout (MAJ, backups, sécurité).

Migration typique (Postgres → Postgres) :

1) Export (depuis l’ancienne DB) :

```bash
pg_dump "$SOURCE_DATABASE_URL" --format=custom --no-owner --no-privileges -f feedverse.dump
```

2) Import (vers la nouvelle DB) :

```bash
pg_restore --dbname "$DEST_DATABASE_URL" --no-owner --no-privileges --clean --if-exists feedverse.dump
```

3) Pointer le backend sur la nouvelle DB (`DB_URL`) et vérifier :

```bash
curl -sS http://localhost:8080/healthz | jq
curl -i  http://localhost:8080/readyz
```

Notes :

- Prévoir une courte fenêtre de maintenance (ou lecture seule) pour éviter la perte de données pendant le switch.
- Si vous êtes derrière un reverse proxy, `TRUST_PROXY=1` est important pour les IP/rate limits.

