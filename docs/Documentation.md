*Mise à jours:* 21 Janvier 2026.

# Feedverse — Documentation

Docs de référence :

- Lancer le projet : [docs/GETTING_STARTED.md](GETTING_STARTED.md)
- Base de données : [docs/Database.md](Database.md)
- Endpoints publics (sans auth) : [docs/Public Endpoints.md](Public%20Endpoints.md)
- Notes techniques (stack, conventions, healthz/readyz, pagination, etc.) : [docs/Engineering Notes.md](Engineering%20Notes.md)
- Snapshot DB : [backend/schema-introspect.json](../backend/schema-introspect.json)

---

## 1) Concept

> Feedverse est un **outil narratif** : un espace où des groupes construisent des histoires à plusieurs, avec une séparation claire par univers/scénario.

### À qui ça sert ?

- Groupes de rôlistes et communautés RP
- Créateurs/GM qui veulent organiser une histoire (personnages, scènes, échanges)
- Joueurs qui incarnent plusieurs personnages dans différents scénarios

### À quoi ça sert ?

- Donner un cadre à l’histoire via des posts et des discussions, rattachés à un scénario
- Créer une présence forte des personnages via des profils dédiés (avatar, header, bio)
- Suivre les interactions importantes (mentions, messages) via temps réel et notifications push

### Modèle mental (comment l’app fonctionne)

- Un **scénario** est un univers indépendant (membres, paramètres, posts, conversations).
- Les utilisateurs incarnent des **profils** (personnages) dans un scénario.
- Les profils publient des **posts** (texte + images) et interagissent via **likes** et **reposts**.
- La messagerie (**DMs**) s’organise en **conversations** (participants = profils) et **messages**.
- Les **character sheets** stockent une fiche structurée par profil.

### Flux typique

1. Se connecter (JWT)
2. Créer ou rejoindre un scénario (invite code)
3. Créer un ou plusieurs profils (personnages)
4. Publier / répondre / mentionner d’autres profils
5. Discuter en DM via conversations
6. Recevoir les updates en temps réel (SSE/WebSocket) et via notifications push

### Mise en route & configuration

La mise en route pas à pas est dans [docs/GETTING_STARTED.md](GETTING_STARTED.md). Pour la configuration, la référence est [backend/.env-example](../backend/.env-example) et, côté mobile, `EXPO_PUBLIC_API_BASE_URL` (voir [mobile/app.json](../mobile/app.json) et [mobile/eas.json](../mobile/eas.json)).

---

## 2) Structure du repo

- `backend/` : API Node/Express/TypeScript
- `mobile/` : app Expo (React Native/TypeScript)
- `docs/` : documentation

---

## 3) Backend — stack & architecture

- Express + TypeScript
- Auth via JWT (`Authorization: Bearer <token>`)
- PostgreSQL
- Uploads (multer) vers Cloudflare R2
- Realtime : SSE + WebSocket (broadcast côté serveur)

Le montage des routes est centralisé dans [backend/src/server.ts](../backend/src/server.ts).

---

## 4) API — conventions

### Base URL

Le mobile construit l’URL via `EXPO_PUBLIC_API_BASE_URL` + le chemin (ex: `/scenarios`).

Le backend monte aussi des routes versionnées sous `/v1` (ex: `/v1/scenarios`) et ajoute `X-API-Version: 1` sur toutes les réponses.

### Auth

Toutes les routes importantes sont authentifiées via :

- `Authorization: Bearer <JWT>`

### JSON (camelCase vs snake_case)

Selon les endpoints, le backend accepte souvent les deux variantes dans le body (ex: `inviteCode` et `invite_code`).

### Erreurs

Les handlers de fin de chaîne (404 + middleware d’erreur) renvoient une enveloppe standard :

- `4xx/5xx` → `{ ok: false, status, error, path, requestId, details? }`

Notes :

- `requestId` correspond au header `x-request-id` (toujours renvoyé par le backend).
- Certains endpoints legacy peuvent encore renvoyer `{ error: string }` (le client doit rester tolérant).

### Pagination

- Posts : `GET /scenarios/:id/posts` supporte `limit` + `cursor`.
  - Sans `limit/cursor` → réponse = tableau `Post[]`.
  - Avec `limit` ou `cursor` → réponse = `{ items: Post[], nextCursor: string | null }`.
  - `cursor` est un string opaque côté client (format actuel: `${updatedAtIso}|${id}`).

- Messages : `GET /conversations/:conversationId/messages` supporte `limit` + `cursor` (et `beforeCreatedAt` historique).
  - Réponse paginée : `{ items: Message[], nextCursor: string | null }`.

### Uploads (multipart)

- User avatar : champ `avatar`
- Profile avatar : champ `avatar`
- Profile header : champ `header`
- Scenario cover : champ `cover`
- Post images : champ `images` (array, max 8)
- Message images : champ `images` (array, max 8)
- Conversation avatar : champ `avatar`

---

## 5) Auth & sessions

### `POST /auth/register`

- Content-Type : `multipart/form-data` (avatar optionnel)
- Champs body : `username`, `name`, `email`, `password_hash` (+ `avatar_url` optionnel)
- Fichier optionnel : `avatar`

Réponse :

- `201` → `{ message, token, user }`
- En cas d’erreurs de validation → `200` → `{ errors: ... }`

### `POST /auth/login`

- Body JSON :
  - `identifier` (ou `email` / `username`)
  - `password_hash`

Réponse :

- `200` → `{ message, token, user }`
- `401` → `{ status, message, statusCode }`

### Sessions (multi-device)

Le backend persiste des sessions (hash SHA-256 du JWT) et peut révoquer des tokens.

- `GET /users/sessions` → `{ currentSession, otherSessions }`
- `POST /users/sessions/logout-others` → `{ revokedCount }`

Dans le mobile, la détection “token invalide/expiré” est centralisée dans [mobile/lib/apiClient.ts](../mobile/lib/apiClient.ts).

---

## 6) Endpoints backend (référence)

### Users

- `GET /users/profile`
  - Réponse : l’utilisateur “safe” (sans hash de mot de passe).

- `GET /users?ids=uuid1,uuid2,...`
  - Réponse : `{ users: [{ id, username, avatarUrl }] }`

- `POST /users/avatar` (multipart `avatar`)
  - Réponse : `{ avatarUrl }`

- `PATCH /users/username`
  - Body : `{ username }`
  - Réponse : `{ username }`
  - Peut renvoyer `409` si déjà pris.

- `POST /users/push-token`
  - Body : `{ expoPushToken, platform? }` (snake_case accepté pour `expo_push_token`)
  - Réponse : `{ ok: true }`

- `GET /users/sessions`
- `POST /users/sessions/logout-others`

### Scenarios

- `GET /scenarios`
  - Réponse : tableau de scénarios accessibles au user.

- `POST /scenarios`
  - Body (principaux champs) :
    - `name` (obligatoire)
    - `inviteCode` / `invite_code`
    - `cover` / `cover_url`
    - `description`
    - `mode` (`story` par défaut)
    - `settings` (objet)
    - `gmUserIds` (array)
    - `tags` (array)
  - Réponse : `{ scenario }`

- `POST /scenarios/join`
  - Body : `{ inviteCode }` (uppercased côté serveur)
  - Réponse : `{ scenario, alreadyIn }`

- `PATCH /scenarios/:id`
  - Body : patch libre (selon champs supportés en DB)
  - Réponse : `{ scenario }`

- `DELETE /scenarios/:id`
  - Réponse : `{ ok: true }`

- `POST /scenarios/:id/leave`
  - Réponse : `{ deleted: boolean }`

- `POST /scenarios/:id/transfer-ownership`
  - Body : `{ toUserId }` (ou `to_user_id`)
  - Réponse : `{ scenario }`

- `POST /scenarios/:id/cover` (multipart `cover`)
  - Réponse : `{ coverUrl }`

Sous-ressources :

- `GET /scenarios/:id/profiles` → `Profile[]`
- `POST /scenarios/:id/profiles` → `{ profile }`

- `POST /scenarios/:id/transfer-profiles`
  - Body : `{ toUserId, profileIds }` (snake_case accepté)
  - Réponse : `{ ok: true, transferred: number, skipped: string[] }`

- `GET /scenarios/:id/posts`
  - Query optionnels : `limit`, `cursor`
  - Réponse : `Post[]` ou `{ items, nextCursor }` (voir conventions)

- `POST /scenarios/:id/posts` → `{ post }`
  - Champs principaux (body) : `authorProfileId`, `text`, `imageUrls`, `parentPostId`, `quotedPostId`, `postType`, `meta` (snake_case accepté sur plusieurs champs).

- `GET /scenarios/:id/reposts` → `Repost[]`
- `GET /scenarios/:id/likes` → `Like[]`

- `GET /scenarios/:id/character-sheets` → `CharacterSheet[]`

### Profiles

- `PATCH /profiles/:id` → `{ profile }`
- `DELETE /profiles/:id` → `{ ok: true }`

- `POST /profiles/:id/adopt`
  - Adopte un profil public (devient owned + privé).
  - Réponse : `{ profile }`

- `GET /profiles/:id/character-sheet` → `{ sheet }`
- `PUT /profiles/:id/character-sheet` → `{ sheet }`

- `POST /profiles/:id/avatar` (multipart `avatar`) → `{ avatarUrl, profile }`
- `POST /profiles/:id/header` (multipart `header`) → `{ headerUrl, profile }`

Note permissions uploads profile : autorisé si vous êtes owner **ou** si le profil est public.

### Posts

- `PATCH /posts/:id` → `{ post }`
- `DELETE /posts/:id` → `{ ok: true }`
- `POST /posts/:id/images` (multipart `images`, max 8) → `{ post }`

### Likes

- `POST /likes/posts/:id`
- `DELETE /likes/posts/:id`
  - Body requis : `{ scenarioId, profileId }` (snake_case accepté)
  - Réponse : `{ liked: boolean, like: Like | null, post: Post }`

### Reposts

- `POST /reposts/posts/:id`
- `DELETE /reposts/posts/:id`
  - Body requis : `{ scenarioId, profileId }` (snake_case accepté)
  - Réponse : `{ reposted: boolean, repost: Repost | null, post: Post }`

### Global tags

- `GET /global-tags`
  - Query optionnel : `q`
  - Réponse : `GlobalTag[]`

### DMs (conversations + messages)

Conversations :

- `GET /scenarios/:scenarioId/conversations?selectedProfileId=...`
  - Réponse : `{ conversations: Conversation[] }`

- `POST /scenarios/:scenarioId/conversations:getOrCreate`
  - Body : `{ selectedProfileId, participantProfileIds, title?, avatarUrl? }`
  - Réponse : `{ conversation }`

- `PUT /conversations/:conversationId`
  - Body : `{ title?, avatarUrl? }`
  - Réponse : `{ conversation }`

- `PUT /conversations/:conversationId/participants`
  - Body : `{ participantProfileIds }`
  - Réponse : `{ conversation }`

- `POST /conversations/:conversationId/avatar` (multipart `avatar`)
  - Réponse : `{ conversation, avatarUrl }`

- `DELETE /conversations/:conversationId`
  - Réponse : `{ ok: true }`

Messages :

- `GET /conversations/:conversationId/messages`
  - Query : `selectedProfileId?`, `limit?`, `beforeCreatedAt?`
  - Réponse : `{ messages: Message[] }`

- `POST /conversations/:conversationId/messages`
  - Body : `senderProfileId`, `text`, `kind?` (défaut `text`)
  - Upload possible : `images` (array, max 8)
  - Réponse : `{ message }`

- `PUT /messages/:messageId`
  - Body : `{ text, senderProfileId? }`
  - Réponse : `{ message }`

- `DELETE /messages/:messageId`
  - Réponse : `{ ok: true }`

Read / unread :

- `POST /conversations/:conversationId/read` (body : `{ profileId }`) → `{ ok: true }`
- `GET /scenarios/:scenarioId/unread?profileId=...` → `{ unread }`

---

## 7) Realtime

### SSE

- `GET /scenarios/:scenarioId/events`

Format SSE :

```text
event: <eventName>
data: <json>
```

### WebSocket

Le serveur attache aussi un WebSocket server et broadcast certains événements (voir [backend/src/server.ts](../backend/src/server.ts)).

### Événements émis

- `conversation.created`
  - Payload : `{ conversation }`

- `message.created`
  - Payload : `{ message, senderUserId }`

- `mention.created`
  - Payload : `{ scenarioId, postId, authorProfileId, mentionedProfileIds, title, body?, mentionedHandles }`

---

## 8) Notifications push (Expo)

### Enregistrement du token

- `POST /users/push-token`

### Envoi côté backend

Lorsque la configuration push est active, le backend peut envoyer des notifications selon les actions :

- mentions (posts)
- messages (DM)
- likes / reposts

Voir la table des tokens dans [docs/Database.md](Database.md).

---

## 9) Intégration API

### Client HTTP

Le client centralisé est dans [mobile/lib/apiClient.ts](../mobile/lib/apiClient.ts) :

- construit l’URL depuis `EXPO_PUBLIC_API_BASE_URL`
- ajoute `Authorization: Bearer <token>`
- détecte les sessions invalides (401 toujours, 403 selon message)
