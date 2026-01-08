# MVP Feedverse — Spécification et Guide

Date: 2026-01-08

Résumé
--
Ce document décrit le périmètre MVP : inclure tout ce qui concerne les comptes `users`, le feed de `scenarios` (posts, likes, reposts, profiles, character sheets), le mode `campaign` (campagne) et les notifications pour les mentions. Exclure la recherche et les messages privés (DMs) du périmètre MVP.

Objectifs du MVP
--
- Authentification basique (JWT / OAuth stub) et gestion de `users`.
- Gestion des `scenarios` et des `profiles` (personnages). Support multi-scénarios.
- Feed de scénario : création, lecture, édition, suppression de `posts` (top-level, replies, quotes).
- Interactions : `likes`, `reposts` et compteurs dénormalisés.
- Mode `campaign` : pins, `character_sheets`, types de posts (roll, log, quest, combat, gm).
- Notifications côté backend pour les mentions (`@handle`) — push queue / enregistrement en DB (événement minimal).

Exclusions
--
- Recherche (indexation / full-text). 
- Messagerie privée (DMs / conversations).

Base de données (tables minimales pour MVP)
--
Les tables ci‑dessous sont celles à implémenter / vérifier dans les migrations :

- `users` (compte utilisateur)
- `auth_identities` (identités OAuth, optionnel pour MVP si simple login suffisant)
- `scenarios` (univers)
- `scenario_players` (liaison user ↔ scenario)
- `profiles` (personnages par scénario)
- `posts` (posts top-level, replies, quotes)
- `likes` (profile_id, post_id, scenario_id)
- `reposts` (post repost events)
- `character_sheets` (campagne)
- `selected_profile_by_user_scenario` (profil actif par user/scenario)
- `notifications` (événements de mention minimale)

Principales contraintes et index recommandés
--
- UUID pour clés primaires (`gen_random_uuid()`)
- Indexes :
  - `users (lower(username))` unique
  - `profiles (scenario_id, lower(handle))` unique
  - `posts (scenario_id, inserted_at DESC, id DESC)` pour pagination
  - `likes (post_id, created_at)` et PK `(profile_id, post_id)`

Comportements essentiels
--
- Pagination cursor : `cursor = insertedAt|id` (stable). Tri d'affichage narratif par `createdAt`.
- Compteurs dénormalisés : `posts.like_count`, `posts.repost_count`, `posts.reply_count`, maintenus transactionnellement.
- Suppression : `ON DELETE CASCADE` pour la plupart des tables, `ON DELETE SET NULL` pour relations entre posts.

Notifications (mentions)
--
- Détecter `@handle` lors de la création/édition d'un post.
- Pour chaque mention valide :
  - Créer une entrée dans `notifications` (recipient_user_id, type:"mention", payload JSON, seen=false)
  - Optionnel : pousser via FCM / APNS si `user` a un token enregistré (implémentation minimale : DB-only + webhook/event pour later)

API — Endpoints prioritaires (REST)
--
Auth (minimum)
- `POST /auth/login` — mock login / échange (retourne tokens)

Users
- `GET /users/me`
- `PATCH /users/me` (username, avatar)

Scenarios & Profiles
- `GET /scenarios`
- `POST /scenarios`
- `GET /scenarios/:id`
- `POST /scenarios/:id/profiles`
- `GET /profiles/:id`
- `PATCH /profiles/:id`

Posts & Feed
- `GET /scenarios/:scenarioId/posts?limit=&cursor=&includeReplies=` — feed (par défaut top-level)
- `GET /posts/:postId` — détail
- `POST /scenarios/:scenarioId/posts` — créer post (author_profile_id obligatoire)
- `POST /posts/:postId/replies` — créer reply
- `PATCH /posts/:postId` — éditer (owner only)
- `DELETE /posts/:postId` — supprimer (owner or mod)

Likes & Reposts
- `POST /posts/:postId/likes` — like (body: {profileId})
- `DELETE /posts/:postId/likes?profileId=...`
- `POST /posts/:postId/reposts`
- `DELETE /posts/:postId/reposts?profileId=...`

Media
- `POST /media/presign` — retourne `uploadUrl` + `fileUrl` (S3 / R2 presign flow)

Notifications
- `GET /users/me/notifications`
- `PATCH /users/me/notifications/:id/read` — mark seen

Permissions (rules rapides)
--
- Modifier/supprimer un post : si `owner of author_profile_id` ou rôle `gm`/admin dans le scénario.
- Créer un post : le `author_profile_id` doit appartenir au user et au scénario.

Déploiement & secrets
--
- Firebase / Push : utiliser `GOOGLE_APPLICATION_CREDENTIALS` ou `FIREBASE_SERVICE_ACCOUNT` via secrets (ne pas committer JSON dans le repo).
- Storage : config Cloudflare R2 (déjà présente dans `backend/.env`), utiliser présign.

Run local (développeurs)
--
1. Installer dépendances : `cd backend && npm install` ; `cd mobile && npm install`
2. Configurer `.env` (DB_URL, R2 keys, `GOOGLE_APPLICATION_CREDENTIALS` ou ADC)
3. Lancer la DB / migrer (neon/local postgres)
4. Build et run backend : `cd backend && npm run build:cjs && npm run start`
5. Lancer mobile : `cd mobile && npx expo start` (ou via `npm run beta` depuis la racine pour dev flow)

Testing
--
- Tests unitaires backend (Jest) pour les routes clés : posts create/edit/delete, like toggle, repost toggle, mentions -> notifications.
- Test d'intégration pour le flux posts → presign → upload (mock) → post creation.

Deliverables pour MVP (pratique)
--
1. Migrations SQL pour les tables listées (idempotent `CREATE TABLE IF NOT EXISTS`).
2. Endpoints REST listés ci‑dessus, couverts par tests unitaires.
3. Parser de mentions et création d'entrées `notifications`.
4. Flux média via `POST /media/presign` et intégration d'URL dans `posts.image_urls`.
5. Documentation d'installation (ajout court à `docs/GETTING_STARTED.md`) et notice sur rotation de secrets.

Étapes suivantes / roadmap
--
- V2 : recherche, DMs, modération, partitionnement des posts, materialized views pour gros scénarios.
- Notifications push réelles (APNS/FCM) et tableau `notification_preferences`.

Cas d'usage (User Stories)
--

Un user doit pouvoir:
- se créer un compte et se connecter (login mock / OAuth), récupérer son profil `users/me`.
- mettre à jour ses informations publiques (`username`, `avatar_url`, `settings`).
- voir la liste des scénarios auxquels il participe et rejoindre un scénario via `invite_code`.
- créer un scénario et en devenir le propriétaire.
- sélectionner lequel de ses profils est actif pour poster dans un scénario (`selected_profile_by_user_scenario`).

Un profile doit pouvoir:
- être créé dans un scénario avec `display_name`, `handle`, `avatar_url`, `bio`.
- être édité ou supprimé par son owner.
- publier un post (rp/roll/log/quest/combat/gm) avec texte et images.
- répondre à un post (reply) et citer un post (quote).
- modifier ou supprimer ses propres posts.
- voir la liste de ses posts et ses reposts (feed profil).

Un scénario doit pouvoir:
- contenir plusieurs profils, posts, tags et paramètres (`settings`) spécifiques.
- avoir un `mode` (`story` | `campaign`) qui active les fonctionnalités de campagne.
- permettre à son owner ou aux `gm_user_ids` d'épingler des posts (pins) et de gérer les sheets.

Le feed / posts doit permettre:
- la pagination stable par curseur (`insertedAt|id`) et filtrage par `authorProfileId` ou `parentPostId`.
- l'affichage des top-level posts par défaut et l'inclusion optionnelle des replies.
- la création et suppression transactionnelle des posts et la mise à jour des compteurs dénormalisés (`reply_count`, `like_count`, `repost_count`).
 - le pull-to-refresh (glisser vers le bas) pour forcer le rafraîchissement et charger les nouveaux posts.

Interactions (likes / reposts)
- un profile doit pouvoir liker un post (une seule fois) et retirer son like.
- un profile doit pouvoir repost un post et annuler le repost.
- les actions de like/repost doivent mettre à jour les compteurs atomiquement.

Mode campagne (GM)
- le MJ (owner ou `gm_user_ids`) doit pouvoir éditer des `character_sheets` pour des profils.
- le MJ doit pouvoir épingler des posts, créer des posts de type `gm` et voir tous les sheets.

Notifications
- lorsqu'un post contient `@handle`, le backend doit créer une `notification` pour le user correspondant.
- un user doit pouvoir lister ses notifications et les marquer comme lues.
- optionnel : envoyer push via FCM/APNS si tokens présents.

Complément : notifications de reply
- lorsqu'un utilisateur reçoit une réponse à son post (reply), le backend doit créer une `notification` de type `reply` pour l'auteur du post parent.
- les notifications (mention + reply) doivent pouvoir être renvoyées en temps réel (websocket) et persistées en DB pour consultation ultérieure.

Realtime
--
- Le backend doit exposer un canal realtime (WebSocket / websocketService) pour pousser :
  - `post.created`, `post.updated`, `post.deleted`
  - `like.toggled`, `repost.toggled`
  - `notification.created` (mention / reply)
- Le client mobile s'abonne aux canaux pertinents (par `scenario_id` et/ou `profile_id`) afin de mettre à jour le feed et la liste de notifications en direct.
- Prévoir un fallback : si la connexion realtime n'est pas disponible, le client utilise le pull-to-refresh ou une courte période de polling.

Media
- un user (via un profile) doit pouvoir demander un `presign` et uploader directement vers R2/S3, puis attacher `fileUrl` au post.

Administration / Propriété
- le propriétaire d'un scénario doit pouvoir transférer la propriété et gérer les participants.
- en cas de suppression d'un user/profile, les données liées (posts, likes, reposts) doivent être nettoyées selon les règles (cascade ou set null) définies.
