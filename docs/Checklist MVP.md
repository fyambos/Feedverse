 # Ticket : Implémentation MVP — Feedverse

Ce ticket regroupe la liste de contrôle pour implémenter le MVP décrit dans `docs/MVP.md` (users, feed, posts, likes, reposts, fonctionnalités de campagne, mentions/notifications, médias, realtime). Priorité suggérée : posts → likes → reposts → mentions.

## Objectif
Livrer un backend minimal et testable couvrant :
- [x] Auth basique / users
- [x] Scénarios & profils
- [ ] Posts (feed, replies, quotes)
- [ ] Likes & reposts
- [ ] Notifications pour mentions et replies
- [ ] Realtime minimal (événements WebSocket)

## Liste de contrôle

### Configuration
- [ ] Documenter la configuration requise dans `backend/.env-example` (DB_URL, R2, GOOGLE_APPLICATION_CREDENTIALS).

### Migrations & BD
- [x] Ajouter migration : `users`, `auth_identities` (optionnel), `scenarios`, `scenario_players`.
- [x] Ajouter migration : `profiles` avec index `profiles (scenario_id, lower(handle))`.
- [x] Ajouter migration : `posts` (avec `inserted_at`, `created_at`, compteurs) et indexes pour pagination.
- [x] Ajouter migration : `likes` (PK `(profile_id, post_id)`) et `reposts`.
- [x] Ajouter migration : `character_sheets`, `selected_profile_by_user_scenario`, `notifications`.

### Backend : API principale
Authentification & Utilisateurs
- [x] `POST /auth/login`
- [x] `POST /auth/register`
- [x] `GET /auth/protected` (utile en “ping” auth)

- [x] `GET /users/me` (user courant via token)
- [x] `PATCH /users/me`
- [x] `PATCH /users/me/settings`
- [ ] `GET /users?ids=uuid1,uuid2` (fetch users en batch)
- [ ] `POST /users/avatar` (multipart)
- [x] `PATCH /users/:id`
- [ ] `DELETE /users/:id`
- [ ] `POST /users/push-token` (Expo push token)

- [ ] `GET /users/sessions` (list sessions)
- [ ] `POST /users/sessions/logout-others` (revoke autres devices)
- [ ] `GET /users/:id/scenarios` (list scenarios)

Scénarios & Profils
- [x] `GET /scenarios`
- [x] `POST /scenarios`
- [x] `GET /scenarios/:id`

- [x] `GET /scenarios/:id/players`
- [ ] `POST /scenarios/join` (join par inviteCode)
- [ ] `POST /scenarios/:id/leave`

- [x] `PATCH /scenarios/:id`
- [x] `DELETE /scenarios/:id`

- [x] `POST /scenarios/:id/transfer-ownership` (body: `{ "newOwnerUserId": "..." }`)
- [ ] `POST /scenarios/:id/transfer-profiles` (body: `{ "profileIds": [], "toUserId": "..." }`)
- [ ] `POST /scenarios/:id/cover`

- [ ] `GET /scenarios/:id/profiles`
- [ ] `POST /scenarios/:id/profiles`

- [ ] `GET /profiles/:id`
- [ ] `PATCH /profiles/:id`
- [ ] `DELETE /profiles/:id`

- [ ] `POST /profiles/:id/adopt` (adoption d’un profil public)
- [ ] `POST /profiles/:id/avatar` + `POST /profiles/:id/header` (multipart)

- [ ] `GET /profiles/:id/character-sheet` + `PUT /profiles/:id/character-sheet`
- [ ] `GET /scenarios/:id/character-sheets`

Publications
- [ ] `GET /scenarios/:scenarioId/posts` (pagination curseur `cursor`, `limit`, option `includeReplies`)
- [ ] `POST /scenarios/:scenarioId/posts` (créer une publication)
- [ ] `GET /posts/:postId`
- [ ] `PATCH /posts/:postId`, `DELETE /posts/:postId`
- [ ] `POST /posts/:postId/images` (upload images du post)

- [ ] S'assurer que les compteurs (`reply_count`) sont mis à jour transactionnellement lors de la création/suppression
- [x] Pull-to-refresh côté client

Likes & Reposts
- [ ] `POST /likes/posts/:postId` + `DELETE /likes/posts/:postId` (toggle like)
- [ ] `POST /reposts/posts/:postId` + `DELETE /reposts/posts/:postId` (toggle repost)

- [ ] `GET /scenarios/:scenarioId/likes` + `GET /scenarios/:scenarioId/reposts` (sync counters/état)

Notifications & Mentions
- [ ] Parser `@handle` dans le texte d'une publication et créer des entrées dans `notifications` (type : `mention`)
- [ ] À la création d'une réponse (reply), créer une `notification` de type `reply` pour l'auteur du post parent
- [ ] `GET /users/me/notifications` et `PATCH /users/me/notifications/:id/read`

Tags
- [ ] `GET /global-tags`

Messagerie (optionnel si feedverse-dev utilise le backend)
- [ ] `GET /scenarios/:scenarioId/conversations`
- [ ] `POST /scenarios/:scenarioId/conversations:getOrCreate`
- [ ] `PUT /conversations/:conversationId` + `PUT /conversations/:conversationId/participants`
- [ ] `POST /conversations/:conversationId/avatar` (upload)
- [ ] `DELETE /conversations/:conversationId`

- [ ] `GET /conversations/:conversationId/messages` + `POST /conversations/:conversationId/messages` (upload images)
- [ ] `PUT /messages/:messageId` + `DELETE /messages/:messageId`
- [ ] `POST /conversations/:conversationId/read` + `GET /scenarios/:scenarioId/unread` (read markers)

Temps réel
- [ ] Endpoint SSE `GET /scenarios/:scenarioId/events`
- [ ] Service/canal WebSocket : émettre `post.created`, `post.updated`, `post.deleted`, `like.toggled`, `repost.toggled`, `notification.created`
- [ ] Portée d'abonnement client : par `scenario_id` et notifications utilisateur
- [x] Solution de secours : pull-to-refresh et polling court

### Spécifique backend MVP — TODOs

- [ ] Implémenter `GET /scenarios` + `POST /scenarios/join` + `POST /scenarios/:id/leave` (sinon l'app ne peut pas naviguer/scoper correctement)
- [ ] Implémenter `GET /scenarios/:id/posts` avec curseur stable (`inserted_at` + `id`) + `POST /scenarios/:id/posts`
- [ ] Implémenter `POST /likes/posts/:id` et `POST /reposts/posts/:id` (et DELETE), + mise à jour atomique des compteurs
- [ ] Implémenter uploads (R2) pour `POST /users/avatar`, `POST /profiles/:id/avatar|header`, `POST /posts/:id/images`, `POST /scenarios/:id/cover`
- [ ] implémenter  la gestion `user_sessions` + endpoints sessions

### Tests
- [ ] Tests unitaires pour la création/édition/suppression de posts et la logique des compteurs
- [ ] Tests pour les basculements likes/reposts et les contraintes d'unicité
- [ ] Tests pour le parsing des mentions → création de notifications
- [ ] Test d'intégration : presign → upload (mock) → création de post

### Livrables / Critères d'acceptation
- [x] Migrations SQL pour toutes les tables MVP (idempotentes `CREATE TABLE IF NOT EXISTS`)
- [ ] Endpoints implémentés et couverts par des tests unitaires pour les flux principaux (posts, likes, reposts, mentions)
- [ ] Le parser de mentions crée des entrées `notifications` et les notifications sont récupérables via l'API
- [ ] Endpoint de presign media compatible R2 (mocké dans les tests)
- [ ] Le realtime émet des événements basiques et le fallback client fonctionne (pull-to-refresh)

### User Stories (résumé)
- [ ] Ajouter une checklist courte de user-stories (voir `docs/MVP.md`) pour que chaque API corresponde à un besoin utilisateur.
- [ ] Un utilisateur doit pouvoir : créer/éditer son compte, créer/jouer des scénarios, sélectionner un profil actif.
- [ ] Un profil doit pouvoir : créer/éditer/supprimer, poster, répondre, éditer ses posts, voir son flux.
- [ ] Le flux doit : pagination par curseur, pull-to-refresh, inclusion optionnelle des réponses.
- [ ] Notifications : mentions & replies créent des notifications persistées et potentiellement pushables.