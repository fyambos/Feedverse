# Détails endpoints Feedverse

**Version :** 1.0.0

**Mise à jour le :** 19 janvier 2026

**Par :** [**Steven YAMBOS**](https://github.com/StevenYAMBOS)

---

## Table des matières

- [Authentification](#authentification)
- [Endpoints utilisateurs](#endpoints-utilisateurs)
  - [Récupérer le profil utilisateur](#récupérer-le-profil-utilisateur)
  - [Modifier le profil utilisateur](#modifier-le-profil-utilisateur)
  - [Récupérer les scénarios d'un utilisateur](#récupérer-les-scénarios-dun-utilisateur)
  - [Supprimer un compte utilisateur](#supprimer-un-compte-utilisateur)
  - [Récupérer les scénarios d'un utilisateur spécifique](#récupérer-les-scénarios-dun-utilisateur-spécifique)
- [Endpoints scénarios](#endpoints-scénarios)
  - [Créer un scénario](#créer-un-scénario)
  - [Récupérer un scénario](#récupérer-un-scénario)
  - [Modifier un scénario](#modifier-un-scénario)
  - [Supprimer un scénario](#supprimer-un-scénario)
  - [Récupérer les participants d'un scénario](#récupérer-les-participants-dun-scénario)
  - [Transférer la propriété d'un scénario](#transférer-la-propriété-dun-scénario)
- [Codes de statut HTTP](#codes-de-statut-http)
- [Gestion des erreurs](#gestion-des-erreurs)

---

## Authentification

**Type :** Bearer Token (JSON Web Token)

Tous les endpoints nécessitent une authentification via JSON Web Token (JWT). Le token doit être inclus dans le header `Authorization` de chaque requête.

### Format du header

```
Authorization: Bearer <votre_jwt_token>
```

### Obtention du token

Le token est obtenu lors de la connexion via OAuth (Google, Apple, GitHub) ou via authentification email/password. Consultez la documentation d'authentification pour plus de détails.

### Expiration

Les tokens JWT expirent après 7 jours. Un nouveau token doit être généré après expiration.

---

## Endpoints utilisateurs

### Récupérer le profil utilisateur

**Endpoint :** `GET /users/profile`

**Description :** Récupère les informations du profil de l'utilisateur authentifié. Cet endpoint permet d'obtenir les données personnelles, les préférences et les paramètres du compte.

**Authentification :** Requise

#### Paramètres de requête

Aucun paramètre requis.

#### Réponse de succès

**Code :** `200 OK`

**Structure :**

```json
{
  "id": "uuid",
  "username": "string",
  "name": "string",
  "email": "string",
  "avatar_url": "string",
  "settings": {
    "showTimestamps": "boolean",
    "darkMode": "string"
  },
  "created_at": "timestamp",
  "updated_at": "timestamp | null",
  "deleted_at": "timestamp | null",
  "is_deleted": "boolean"
}
```

#### Exemple de réponse

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "jiniret",
  "name": "Hyunjin",
  "email": "hyunjin@example.com",
  "avatar_url": "https://cdn.feedverse.com/avatars/550e8400.jpg",
  "settings": {
    "showTimestamps": true,
    "darkMode": "system"
  },
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-06-20T14:22:00Z",
  "deleted_at": null,
  "is_deleted": false
}
```

#### Exemple de code

**JavaScript (Fetch API) :**

```javascript
const response = await fetch('https://api.feedverse.com/v1/users/profile', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const user = await response.json();
```

**cURL :**

```bash
curl -X GET https://api.feedverse.com/v1/users/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### Codes de statut

| Code | Description |
|------|-------------|
| `200` | Succès - Profil récupéré |
| `401` | Non autorisé - Token invalide ou expiré |
| `500` | Erreur serveur interne |

#### Erreurs possibles

**401 Unauthorized :**

```json
{
  "error": "Token invalide ou expiré"
}
```

---

### Modifier le profil utilisateur

**Endpoint :** `PATCH /users/me`

**Description :** Met à jour les informations du profil de l'utilisateur authentifié. Permet la modification partielle du `username`, de l'`avatar` et des `settings` (préférences utilisateur). Tous les champs sont optionnels, seuls les champs fournis seront mis à jour.

**Authentification :** Requise

**Content-Type :** `multipart/form-data` (pour l'upload d'avatar)

#### Paramètres du corps de requête

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `username` | string | Non | Nouveau nom d'utilisateur (3-30 caractères, lettres, chiffres et underscores uniquement) |
| `avatar` | file | Non | Nouvelle image de profil (JPG, PNG, WEBP, max 5 Mo) |
| `settings` | string | Non | Préférences utilisateur au format JSON stringifié |

#### Structure du champ settings

Le champ `settings` doit être un objet JSON stringifié contenant :

```json
{
  "showTimestamps": boolean,
  "darkMode": "light" | "dark" | "system"
}
```

**Champs disponibles :**

- **showTimestamps** : Affichage des timestamps dans l'interface (optionnel)
- **darkMode** : Mode d'affichage de l'interface (optionnel)
  - `"light"` : Mode clair
  - `"dark"` : Mode sombre
  - `"system"` : Suit les préférences système

#### Validation des champs

**username :**

- Longueur : 3 à 30 caractères
- Caractères autorisés : lettres (a-z, A-Z), chiffres (0-9), underscore (_)
- Doit être unique globalement
- Trim automatique des espaces

**avatar :**

- Formats acceptés : JPEG, PNG, WEBP
- Taille maximale : 5 Mo
- Stockage : Cloudflare R2
- Génération automatique d'une URL publique

**settings :**

- Doit être un objet JSON valide
- Fusion avec les paramètres existants (ne remplace pas complètement)
- Validation du type pour `showTimestamps` (boolean)
- Validation des valeurs pour `darkMode` (light/dark/system)

#### Réponse de succès

**Code :** `200 OK`

**Structure :**

```json
{
  "message": "string",
  "user": {
    "id": "uuid",
    "username": "string",
    "name": "string",
    "email": "string",
    "avatar_url": "string",
    "settings": {
      "showTimestamps": "boolean",
      "darkMode": "string"
    },
    "created_at": "timestamp",
    "updated_at": "timestamp",
    "deleted_at": "timestamp | null",
    "is_deleted": "boolean"
  }
}
```

#### Exemple de réponse

```json
{
  "message": "Profil mis à jour avec succès",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "hyunjin_official",
    "name": "Hyunjin",
    "email": "hyunjin@example.com",
    "avatar_url": "https://cdn.feedverse.com/users/550e8400_1737123456.jpg",
    "settings": {
      "showTimestamps": true,
      "darkMode": "system"
    },
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2026-01-17T14:22:00Z",
    "deleted_at": null,
    "is_deleted": false
  }
}
```

#### Exemple de code

**JavaScript (Fetch API avec FormData) :**

```javascript
const formData = new FormData();
formData.append('username', 'hyunjin_official');
formData.append('settings', JSON.stringify({
  showTimestamps: true,
  darkMode: 'system'
}));
formData.append('avatar', avatarFile);

const response = await fetch('https://api.feedverse.com/v1/users/me', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const { user } = await response.json();
```

**cURL :**

```bash
curl -X PATCH https://api.feedverse.com/v1/users/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "username=hyunjin_official" \
  -F "settings={\"showTimestamps\":true,\"darkMode\":\"system\"}" \
  -F "avatar=@/path/to/avatar.jpg"
```

#### Codes de statut

| Code | Description |
|------|-------------|
| `200` | Succès - Profil mis à jour |
| `400` | Requête invalide - Validation échouée |
| `401` | Non autorisé - Token invalide ou expiré |
| `409` | Conflit - Username déjà utilisé |
| `500` | Erreur serveur interne |

#### Erreurs possibles

**400 Bad Request (validation username) :**

```json
{
  "errors": [
    {
      "fields": "username",
      "message": "Le nom d'utilisateur doit contenir au moins 3 caractères"
    }
  ]
}
```

**400 Bad Request (validation settings) :**

```json
{
  "errors": [
    {
      "fields": "settings.darkMode",
      "message": "darkMode doit être 'light', 'dark' ou 'system'"
    }
  ]
}
```

**400 Bad Request (JSON invalide) :**

```json
{
  "errors": [
    {
      "fields": "settings",
      "message": "Format JSON invalide pour les paramètres"
    }
  ]
}
```

**409 Conflict :**

```json
{
  "errors": [
    {
      "fields": "username",
      "message": "Ce nom d'utilisateur est déjà utilisé"
    }
  ]
}
```

#### Notes techniques

- **Mise à jour partielle** : Seuls les champs fournis sont modifiés, les autres restent inchangés
- **Fusion des settings** : Les nouveaux paramètres sont fusionnés avec les existants plutôt que de les remplacer complètement
- **Upload d'avatar** : L'ancien avatar n'est pas supprimé automatiquement de Cloudflare R2
- **Unicité du username** : La vérification exclut l'utilisateur actuel pour permettre de garder son propre username
- **Insensibilité à la casse** : Le username est stocké tel quel mais la vérification d'unicité est insensible à la casse
- **Timestamp** : Le champ `updated_at` est automatiquement mis à jour lors de toute modification

#### Cas d'usage

**Changer uniquement le username :**

```bash
curl -X PATCH https://api.feedverse.com/v1/users/me \
  -H "Authorization: Bearer TOKEN" \
  -F "username=new_username"
```

**Activer le mode sombre :**

```bash
curl -X PATCH https://api.feedverse.com/v1/users/me \
  -H "Authorization: Bearer TOKEN" \
  -F "settings={\"darkMode\":\"dark\"}"
```

**Modifier uniquement l'avatar :**

```bash
curl -X PATCH https://api.feedverse.com/v1/users/me \
  -H "Authorization: Bearer TOKEN" \
  -F "avatar=@avatar.jpg"
```

---

### Récupérer les scénarios d'un utilisateur

**Endpoint :** `GET /users/scenarios`

**Description :** Récupère la liste complète des scénarios auxquels l'utilisateur authentifié participe. Inclut les scénarios créés par l'utilisateur et ceux où il a été invité. La réponse indique également si l'utilisateur est propriétaire de chaque scénario.

**Authentification :** Requise

#### Paramètres de requête

Aucun paramètre requis.

#### Réponse de succès

**Code :** `200 OK`

**Structure :**

```json
{
  "message": "string",
  "scenarios": [
    {
      "id": "uuid",
      "name": "string",
      "cover": "string",
      "invite_code": "string",
      "owner_user_id": "uuid",
      "description": "string | null",
      "mode": "story | campaign",
      "is_owner": "boolean",
      "created_at": "timestamp",
      "updated_at": "timestamp | null"
    }
  ],
  "count": "number"
}
```

#### Champs de la réponse

- **message** : Message de confirmation de succès
- **scenarios** : Tableau des scénarios de l'utilisateur
  - **id** : Identifiant unique du scénario (UUID v4)
  - **name** : Nom du scénario
  - **cover** : URL de l'image de couverture
  - **invite_code** : Code d'invitation unique (en majuscules)
  - **owner_user_id** : Identifiant du propriétaire du scénario
  - **description** : Description optionnelle du scénario
  - **mode** : Mode du scénario (`story` pour narration libre, `campaign` pour jeu de rôle)
  - **is_owner** : Indique si l'utilisateur est le propriétaire (utile pour afficher des options spécifiques)
  - **created_at** : Date de création du scénario
  - **updated_at** : Date de dernière modification
- **count** : Nombre total de scénarios retournés

#### Exemple de réponse

```json
{
  "message": "Scénarios récupérés avec succès",
  "scenarios": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "K-Pop Universe",
      "cover": "https://cdn.feedverse.com/covers/kpop-universe.jpg",
      "invite_code": "KPOP2024",
      "owner_user_id": "550e8400-e29b-41d4-a716-446655440000",
      "description": "Un univers narratif centré sur le monde de la K-Pop",
      "mode": "story",
      "is_owner": true,
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-06-20T15:30:00Z"
    },
    {
      "id": "987f6543-e21c-43d2-b654-321987654321",
      "name": "Fantasy Campaign",
      "cover": "https://cdn.feedverse.com/covers/fantasy-campaign.jpg",
      "invite_code": "FANTASY",
      "owner_user_id": "999e8400-e29b-41d4-a716-446655440999",
      "description": null,
      "mode": "campaign",
      "is_owner": false,
      "created_at": "2024-03-10T14:22:00Z",
      "updated_at": null
    }
  ],
  "count": 2
}
```

#### Exemple de code

**JavaScript (Fetch API) :**

```javascript
const response = await fetch('https://api.feedverse.com/v1/users/scenarios', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const { scenarios, count } = await response.json();
console.log(`Vous participez à ${count} scénario(s)`);
```

**cURL :**

```bash
curl -X GET https://api.feedverse.com/v1/users/scenarios \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### Codes de statut

| Code | Description |
|------|-------------|
| `200` | Succès - Liste récupérée |
| `401` | Non autorisé - Token invalide ou expiré |
| `500` | Erreur serveur interne |

#### Notes techniques

- Les scénarios sont triés par date de création décroissante (plus récents en premier)
- La requête utilise une jointure SQL entre `scenarios` et `scenario_players`
- Le champ `is_owner` est calculé dynamiquement via une comparaison SQL

---

### Supprimer un compte utilisateur

**Endpoint :** `DELETE /users/:id`

**Description :** Supprime le compte de l'utilisateur authentifié via soft delete. Cette opération anonymise les données personnelles (email, nom, mot de passe) tout en préservant les contenus créés (posts, profils) pour maintenir la cohérence narrative des scénarios partagés.

**Authentification :** Requise

**Type de suppression :** Soft delete (suppression logique)

#### Paramètres de route

| Paramètre | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Identifiant de l'utilisateur à supprimer |

#### Validation

- L'identifiant doit être au format UUID v4
- L'utilisateur ne peut supprimer que son propre compte (vérification via JWT)
- Le compte ne doit pas avoir déjà été supprimé

#### Comportement de la suppression

**Données anonymisées :**

- Email remplacé par `deleted_<id>@feedverse.deleted`
- Username remplacé par `deleted_user_<8_premiers_caractères_uuid>`
- Name remplacé par `Compte supprimé`
- Password hash supprimé (NULL)
- Settings réinitialisés (`{}`)

**Données préservées :**

- ID du compte (pour maintenir les relations)
- Posts et profils créés (visibles avec "Compte supprimé")
- Participations aux scénarios (historique narratif)
- Messages dans les conversations

#### Réponse de succès

**Code :** `200 OK`

**Structure :**

```json
{
  "message": "string"
}
```

#### Exemple de réponse

```json
{
  "message": "Compte supprimé avec succès"
}
```

#### Exemple de code

**JavaScript (Fetch API) :**

```javascript
const userId = '550e8400-e29b-41d4-a716-446655440000';

const response = await fetch(`https://api.feedverse.com/v1/users/${userId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const { message } = await response.json();
```

**cURL :**

```bash
curl -X DELETE https://api.feedverse.com/v1/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### Codes de statut

| Code | Description |
|------|-------------|
| `200` | Succès - Compte supprimé |
| `400` | Requête invalide - Format UUID incorrect |
| `401` | Non autorisé - Token invalide ou expiré |
| `403` | Interdit - Tentative de suppression d'un autre compte |
| `404` | Non trouvé - Utilisateur inexistant ou déjà supprimé |
| `500` | Erreur serveur interne |

#### Erreurs possibles

**400 Bad Request :**

```json
{
  "errors": [
    {
      "fields": "id",
      "message": "Format d'identifiant invalide"
    }
  ]
}
```

**403 Forbidden :**

```json
{
  "errors": [
    {
      "fields": "authorization",
      "message": "Vous ne pouvez supprimer que votre propre compte"
    }
  ]
}
```

**404 Not Found :**

```json
{
  "errors": [
    {
      "fields": "id",
      "message": "Utilisateur introuvable"
    }
  ]
}
```

#### Notes importantes

- **Irréversibilité partielle** : Les données personnelles sont définitivement anonymisées
- **Conformité RGPD** : Suppression complète des données à caractère personnel
- **Impact minimal** : Les autres utilisateurs conservent l'accès aux conversations et contenus partagés
- **Restauration** : Impossible sans intervention manuelle de l'administrateur
- **Connexion** : Le token JWT devient invalide après suppression

---

### Récupérer les scénarios d'un utilisateur spécifique

**Endpoint :** `GET /users/:userId/scenarios`

**Description :** Récupère la liste complète des scénarios auxquels un utilisateur spécifique participe. Inclut les scénarios créés par l'utilisateur et ceux où il a été invité. Cette route permet de consulter les scénarios d'un autre utilisateur que soi-même.

**Authentification :** Requise

#### Paramètres de route

| Paramètre | Type | Description |
|-----------|------|-------------|
| `userId` | UUID | Identifiant unique de l'utilisateur dont on veut récupérer les scénarios |

#### Validation

- L'identifiant doit être au format UUID v4
- L'utilisateur demandé doit exister dans la base de données
- L'utilisateur demandeur doit être authentifié

#### Réponse de succès

**Code :** `200 OK`

**Structure :**

```json
{
  "message": "string",
  "scenarios": [
    {
      "id": "uuid",
      "name": "string",
      "cover": "string",
      "invite_code": "string",
      "owner_user_id": "uuid",
      "description": "string | null",
      "mode": "story | campaign",
      "is_owner": "boolean",
      "created_at": "timestamp",
      "updated_at": "timestamp | null"
    }
  ],
  "count": "number"
}
```

#### Champs de la réponse

- **message** : Message de confirmation de succès
- **scenarios** : Tableau des scénarios de l'utilisateur
  - **id** : Identifiant unique du scénario (UUID v4)
  - **name** : Nom du scénario
  - **cover** : URL de l'image de couverture
  - **invite_code** : Code d'invitation unique (en majuscules)
  - **owner_user_id** : Identifiant du propriétaire du scénario
  - **description** : Description optionnelle du scénario
  - **mode** : Mode du scénario (`story` pour narration libre, `campaign` pour jeu de rôle)
  - **is_owner** : Indique si l'utilisateur demandé est le propriétaire
  - **created_at** : Date de création du scénario
  - **updated_at** : Date de dernière modification
- **count** : Nombre total de scénarios retournés

#### Exemple de réponse

```json
{
  "message": "Scénarios récupérés avec succès",
  "scenarios": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "K-Pop Universe",
      "cover": "https://cdn.feedverse.com/covers/kpop-universe.jpg",
      "invite_code": "KPOP2024",
      "owner_user_id": "550e8400-e29b-41d4-a716-446655440000",
      "description": "Un univers narratif centré sur le monde de la K-Pop",
      "mode": "story",
      "is_owner": true,
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-06-20T15:30:00Z"
    },
    {
      "id": "987f6543-e21c-43d2-b654-321987654321",
      "name": "Fantasy Campaign",
      "cover": "https://cdn.feedverse.com/covers/fantasy-campaign.jpg",
      "invite_code": "FANTASY",
      "owner_user_id": "999e8400-e29b-41d4-a716-446655440999",
      "description": null,
      "mode": "campaign",
      "is_owner": false,
      "created_at": "2024-03-10T14:22:00Z",
      "updated_at": null
    }
  ],
  "count": 2
}
```

#### Exemple de code

**JavaScript (Fetch API) :**

```javascript
const userId = '550e8400-e29b-41d4-a716-446655440000';

const response = await fetch(`https://api.feedverse.com/v1/users/${userId}/scenarios`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const { scenarios, count } = await response.json();
console.log(`Cet utilisateur participe à ${count} scénario(s)`);
```

**cURL :**

```bash
curl -X GET https://api.feedverse.com/v1/users/550e8400-e29b-41d4-a716-446655440000/scenarios \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### Codes de statut

| Code | Description |
|------|-------------|
| `200` | Succès - Liste récupérée |
| `400` | Requête invalide - Format UUID incorrect |
| `401` | Non autorisé - Token invalide ou expiré |
| `404` | Non trouvé - Utilisateur inexistant |
| `500` | Erreur serveur interne |

#### Erreurs possibles

**400 Bad Request :**

```json
{
  "errors": [
    {
      "fields": "userId",
      "message": "Format d'identifiant invalide"
    }
  ]
}
```

**404 Not Found :**

```json
{
  "errors": [
    {
      "fields": "userId",
      "message": "Utilisateur introuvable"
    }
  ]
}
```

#### Notes techniques

- Les scénarios sont triés par date de création décroissante (plus récents en premier)
- La requête utilise une jointure SQL entre `scenarios` et `scenario_players`
- Le champ `is_owner` est calculé dynamiquement pour l'utilisateur demandé
- Contrairement à `GET /users/me/scenarios`, cette route nécessite la validation de l'UUID fourni

#### Différence avec `/users/me/scenarios`

| Critère | `/users/:userId/scenarios` | `/users/me/scenarios` |
|---------|---------------------------|----------------------|
| **Utilisateur ciblé** | Spécifié dans l'URL | Utilisateur connecté |
| **Validation UUID** | Requise | Non (extrait du JWT) |
| **Cas d'usage** | Voir les scénarios d'un autre utilisateur | Voir ses propres scénarios |

---

## Endpoints scénarios

### Créer un scénario

**Endpoint :** `POST /scenarios/create`

**Description :** Crée un nouveau scénario narratif. L'utilisateur authentifié devient automatiquement le propriétaire et le premier participant du scénario. Si le mode est `campaign`, l'utilisateur est également ajouté comme Maître du Jeu (MJ).

**Authentification :** Requise

**Content-Type :** `multipart/form-data` (pour l'upload de la couverture)

#### Paramètres du corps de requête

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `name` | string | Oui | Nom du scénario (1-100 caractères) |
| `invite_code` | string | Oui | Code d'invitation unique (4-20 caractères, alphanumérique, insensible à la casse) |
| `description` | string | Non | Description du scénario (max 500 caractères) |
| `mode` | string | Oui | Mode du scénario : `story` ou `campaign` |
| `cover` | file | Non | Image de couverture (JPG, PNG, max 5 Mo) |

#### Validation des champs

**name :**

- Longueur : 1 à 100 caractères
- Trim automatique des espaces

**invite_code :**

- Longueur : 4 à 20 caractères
- Caractères autorisés : lettres, chiffres, underscore
- Converti automatiquement en majuscules
- Doit être unique globalement

**mode :**

- Valeurs acceptées : `story`, `campaign`
- Par défaut : `story`

**cover :**

- Formats acceptés : JPEG, PNG, WEBP
- Taille maximale : 5 Mo
- Stockage : Amazon Web Services (AWS) S3 / Cloudflare R2

#### Réponse de succès

**Code :** `201 Created`

**Structure :**

```json
{
  "message": "string",
  "scenario": {
    "Scenario": {
      "id": "uuid",
      "name": "string",
      "cover": "string",
      "invite_code": "string",
      "owner_user_id": "uuid",
      "description": "string | null",
      "mode": "story | campaign",
      "gm_user_ids": ["uuid"],
      "settings": {},
      "created_at": "timestamp",
      "updated_at": "timestamp | null"
    }
  }
}
```

#### Exemple de requête

**JavaScript (Fetch API avec FormData) :**

```javascript
const formData = new FormData();
formData.append('name', 'K-Pop Universe');
formData.append('invite_code', 'KPOP2024');
formData.append('description', 'Un univers narratif K-Pop');
formData.append('mode', 'story');
formData.append('cover', coverImageFile); // File object

const response = await fetch('https://api.feedverse.com/v1/scenarios/create', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const { scenario } = await response.json();
```

**cURL :**

```bash
curl -X POST https://api.feedverse.com/v1/scenarios/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "name=K-Pop Universe" \
  -F "invite_code=KPOP2024" \
  -F "description=Un univers narratif K-Pop" \
  -F "mode=story" \
  -F "cover=@/path/to/cover.jpg"
```

#### Exemple de réponse

```json
{
  "message": "Scénario créé avec succès",
  "scenario": {
    "Scenario": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "K-Pop Universe",
      "cover": "https://cdn.feedverse.com/scenarios/123e4567/cover.jpg",
      "invite_code": "KPOP2024",
      "owner_user_id": "550e8400-e29b-41d4-a716-446655440000",
      "description": "Un univers narratif K-Pop",
      "mode": "story",
      "gm_user_ids": [],
      "settings": {},
      "created_at": "2026-01-15T10:30:00Z",
      "updated_at": null
    }
  }
}
```

#### Codes de statut

| Code | Description |
|------|-------------|
| `201` | Succès - Scénario créé |
| `400` | Requête invalide - Validation échouée |
| `401` | Non autorisé - Token invalide ou expiré |
| `409` | Conflit - Code d'invitation déjà utilisé |
| `500` | Erreur serveur interne |

#### Erreurs possibles

**400 Bad Request (validation) :**

```json
{
  "errors": [
    {
      "fields": "name",
      "message": "Le nom du scénario doit contenir entre 1 et 100 caractères"
    },
    {
      "fields": "invite_code",
      "message": "Le code d'invitation doit contenir entre 4 et 20 caractères"
    }
  ]
}
```

**409 Conflict :**

```json
{
  "errors": [
    {
      "fields": "invite_code",
      "message": "Ce code d'invitation est déjà utilisé"
    }
  ]
}
```

#### Notes techniques

- Le créateur est automatiquement ajouté à la table `scenario_players`
- Si `mode = "campaign"`, le `owner_user_id` est ajouté au tableau `gm_user_ids`
- L'image de couverture est uploadée sur Cloudflare R2 si fournie
- Le champ `settings` est initialisé à `{}` (extensible pour futures fonctionnalités)
- L'`invite_code` est converti en majuscules avant stockage

---

### Récupérer un scénario

**Endpoint :** `GET /scenarios/:id`

**Description :** Récupère les informations détaillées d'un scénario spécifique. L'utilisateur doit être participant du scénario pour y accéder.

**Authentification :** Requise

#### Paramètres de route

| Paramètre | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Identifiant unique du scénario |

#### Validation

- L'identifiant doit être au format UUID v4
- L'utilisateur doit avoir accès au scénario (membre de `scenario_players`)

#### Réponse de succès

**Code :** `200 OK`

**Structure :**

```json
{
  "scenario": {
    "id": "uuid",
    "name": "string",
    "cover": "string",
    "invite_code": "string",
    "owner_user_id": "uuid",
    "description": "string | null",
    "mode": "story | campaign",
    "gm_user_ids": ["uuid"],
    "settings": {},
    "created_at": "timestamp",
    "updated_at": "timestamp | null"
  }
}
```

#### Exemple de réponse

```json
{
  "scenario": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "K-Pop Universe",
    "cover": "https://cdn.feedverse.com/scenarios/123e4567/cover.jpg",
    "invite_code": "KPOP2024",
    "owner_user_id": "550e8400-e29b-41d4-a716-446655440000",
    "description": "Un univers narratif centré sur le monde de la K-Pop",
    "mode": "story",
    "gm_user_ids": [],
    "settings": {
      "profileLimitMode": "per_owner",
      "pinnedPostIds": []
    },
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2024-06-20T15:30:00Z"
  }
}
```

#### Exemple de code

**JavaScript (Fetch API) :**

```javascript
const scenarioId = '123e4567-e89b-12d3-a456-426614174000';

const response = await fetch(`https://api.feedverse.com/v1/scenarios/${scenarioId}`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const { scenario } = await response.json();
```

**cURL :**

```bash
curl -X GET https://api.feedverse.com/v1/scenarios/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### Codes de statut

| Code | Description |
|------|-------------|
| `200` | Succès - Scénario récupéré |
| `400` | Requête invalide - Format UUID incorrect |
| `401` | Non autorisé - Token invalide ou expiré |
| `404` | Non trouvé - Scénario inexistant ou accès refusé |
| `500` | Erreur serveur interne |

#### Erreurs possibles

**400 Bad Request :**

```json
{
  "errors": [
    {
      "fields": "id",
      "message": "Format d'identifiant invalide"
    }
  ]
}
```

**404 Not Found :**

```json
{
  "errors": [
    {
      "fields": "id",
      "message": "Scénario introuvable"
    }
  ]
}
```

#### Notes techniques

- La vérification d'accès au scénario sera implémentée ultérieurement
- Pour l'instant, tous les scénarios sont accessibles si l'utilisateur est authentifié
- Le champ `settings` peut contenir des configurations spécifiques au mode (story/campaign)

---

### Supprimer un scénario

**Endpoint :** `DELETE /scenarios/:id`

**Description :** Supprime définitivement un scénario et toutes ses données associées (hard delete). Cette opération est irréversible et supprime en cascade tous les profils, posts, likes, reposts, conversations et messages liés au scénario.

**Authentification :** Requise

**Type de suppression :** Hard delete (suppression physique)

#### Paramètres de route

| Paramètre | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Identifiant unique du scénario à supprimer |

#### Validation

- L'identifiant doit être au format UUID v4
- Seul le propriétaire du scénario (`owner_user_id`) peut le supprimer
- Le scénario doit exister dans la base de données

#### Comportement de la suppression

**Données supprimées en cascade (via contraintes SQL) :**

- Tous les profils du scénario (`profiles`)
- Tous les posts du scénario (`posts`)
- Tous les likes du scénario (`likes`)
- Tous les reposts du scénario (`reposts`)
- Toutes les conversations du scénario (`conversations`)
- Tous les messages du scénario (`messages`)
- Toutes les participations au scénario (`scenario_players`)
- Tous les tags du scénario (`scenario_tags`)
- Toutes les feuilles de personnage associées (`character_sheets`)

#### Réponse de succès

**Code :** `200 OK`

**Structure :**

```json
{
  "message": "string"
}
```

#### Exemple de réponse

```json
{
  "message": "Scénario supprimé avec succès"
}
```

#### Exemple de code

**JavaScript (Fetch API) :**

```javascript
const scenarioId = '123e4567-e89b-12d3-a456-426614174000';

const response = await fetch(`https://api.feedverse.com/v1/scenarios/${scenarioId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const { message } = await response.json();
```

**cURL :**

```bash
curl -X DELETE https://api.feedverse.com/v1/scenarios/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### Codes de statut

| Code | Description |
|------|-------------|
| `200` | Succès - Scénario supprimé |
| `400` | Requête invalide - Format UUID incorrect |
| `401` | Non autorisé - Token invalide ou expiré |
| `403` | Interdit - L'utilisateur n'est pas le propriétaire |
| `404` | Non trouvé - Scénario inexistant |
| `500` | Erreur serveur interne |

#### Erreurs possibles

**400 Bad Request :**

```json
{
  "errors": [
    {
      "fields": "id",
      "message": "Format d'identifiant invalide"
    }
  ]
}
```

**403 Forbidden :**

```json
{
  "errors": [
    {
      "fields": "authorization",
      "message": "Votre email Google n'est pas vérifié"
    }
  ]
}
```

**404 Not Found :**

```json
{
  "errors": [
    {
      "fields": "id",
      "message": "Scénario introuvable"
    }
  ]
}
```

#### Notes importantes

- **Irréversibilité** : La suppression est définitive et ne peut pas être annulée
- **Impact sur les participants** : Tous les participants perdent l'accès au scénario et à son contenu
- **Suppression en cascade** : Les contraintes SQL `ON DELETE CASCADE` gèrent automatiquement la suppression de toutes les données liées
- **Permissions** : Seul le propriétaire (`owner_user_id`) peut supprimer le scénario
- **Alternative** : Pour conserver l'historique, envisagez un transfert de propriété (`PATCH /scenarios/:id/owner`) avant suppression

---

### Modifier un scénario

**Endpoint :** `PATCH /scenarios/:id`

**Description :** Met à jour les informations d'un scénario existant. Permet la modification partielle du nom, de la description, du code d'invitation et de l'image de couverture. Seul le propriétaire du scénario peut effectuer ces modifications.

**Authentification :** Requise

**Content-Type :** `multipart/form-data` (pour l'upload de la couverture)

#### Paramètres de route

| Paramètre | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Identifiant unique du scénario à modifier |

#### Paramètres du corps de requête

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `name` | string | Non | Nouveau nom du scénario (3-100 caractères) |
| `description` | string | Non | Nouvelle description (max 500 caractères) |
| `invite_code` | string | Non | Nouveau code d'invitation (6-20 caractères, alphanumérique) |
| `cover` | file | Non | Nouvelle image de couverture (JPG, PNG, WEBP, max 5 Mo) |

#### Validation des champs

**name :**

- Longueur : 3 à 100 caractères
- Trim automatique des espaces

**description :**

- Longueur maximale : 500 caractères
- Peut être vide (null)
- Trim automatique des espaces

**invite_code :**

- Longueur : 6 à 20 caractères
- Caractères autorisés : lettres majuscules et chiffres uniquement
- Converti automatiquement en majuscules
- Doit être unique globalement (sauf pour le code actuel du scénario)

**cover :**

- Formats acceptés : JPEG, PNG, WEBP
- Taille maximale : 5 Mo
- Stockage : Cloudflare R2

#### Autorisations

- Seul le propriétaire du scénario (`owner_user_id`) peut le modifier
- Vérification automatique via le JWT de l'utilisateur connecté

#### Réponse de succès

**Code :** `200 OK`

**Structure :**

```json
{
  "message": "string",
  "scenario": {
    "id": "uuid",
    "name": "string",
    "cover": "string",
    "invite_code": "string",
    "owner_user_id": "uuid",
    "description": "string | null",
    "mode": "story | campaign",
    "gm_user_ids": ["uuid"],
    "settings": {},
    "created_at": "timestamp",
    "updated_at": "timestamp"
  }
}
```

#### Exemple de réponse

```json
{
  "message": "Scénario mis à jour avec succès",
  "scenario": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "K-Pop Universe - Season 2",
    "cover": "https://cdn.feedverse.com/scenarios/123e4567/cover_1737123456.jpg",
    "invite_code": "KPOP2025",
    "owner_user_id": "550e8400-e29b-41d4-a716-446655440000",
    "description": "Un univers narratif K-Pop - Nouvelle saison",
    "mode": "story",
    "gm_user_ids": [],
    "settings": {
      "profileLimitMode": "per_owner",
      "pinnedPostIds": []
    },
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2026-01-17T16:45:00Z"
  }
}
```

#### Exemple de code

**JavaScript (Fetch API avec FormData) :**

```javascript
const scenarioId = '123e4567-e89b-12d3-a456-426614174000';
const formData = new FormData();
formData.append('name', 'K-Pop Universe - Season 2');
formData.append('description', 'Un univers narratif K-Pop - Nouvelle saison');
formData.append('invite_code', 'KPOP2025');
formData.append('cover', coverFile);

const response = await fetch(`https://api.feedverse.com/v1/scenarios/${scenarioId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const { scenario } = await response.json();
```

**cURL :**

```bash
curl -X PATCH https://api.feedverse.com/v1/scenarios/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "name=K-Pop Universe - Season 2" \
  -F "description=Un univers narratif K-Pop - Nouvelle saison" \
  -F "invite_code=KPOP2025" \
  -F "cover=@/path/to/new-cover.jpg"
```

#### Codes de statut

| Code | Description |
|------|-------------|
| `200` | Succès - Scénario mis à jour |
| `400` | Requête invalide - Validation échouée ou format UUID incorrect |
| `401` | Non autorisé - Token invalide ou expiré |
| `403` | Interdit - L'utilisateur n'est pas le propriétaire |
| `404` | Non trouvé - Scénario inexistant |
| `409` | Conflit - Code d'invitation déjà utilisé |
| `500` | Erreur serveur interne |

#### Erreurs possibles

**400 Bad Request (validation) :**

```json
{
  "errors": [
    {
      "fields": "name",
      "message": "Le nom du scénario doit contenir entre 3 et 100 caractères"
    }
  ]
}
```

**400 Bad Request (UUID invalide) :**

```json
{
  "errors": [
    {
      "fields": "id",
      "message": "Format d'identifiant invalide"
    }
  ]
}
```

**403 Forbidden :**

```json
{
  "errors": [
    {
      "fields": "authorization",
      "message": "Seul le propriétaire peut modifier ce scénario"
    }
  ]
}
```

**404 Not Found :**

```json
{
  "errors": [
    {
      "fields": "id",
      "message": "Scénario introuvable"
    }
  ]
}
```

**409 Conflict :**

```json
{
  "errors": [
    {
      "fields": "invite_code",
      "message": "Ce code d'invitation est déjà utilisé"
    }
  ]
}
```

#### Notes techniques

- **Mise à jour partielle** : Seuls les champs fournis sont modifiés, les autres restent inchangés
- **Validation du code d'invitation** : Le code actuel du scénario est exclu de la vérification d'unicité
- **Upload de couverture** : L'ancienne image n'est pas supprimée automatiquement de Cloudflare R2
- **Timestamp** : Le champ `updated_at` est automatiquement mis à jour
- **Permissions strictes** : Même les administrateurs ne peuvent pas modifier un scénario dont ils ne sont pas propriétaires

#### Cas d'usage

**Changer uniquement le nom :**

```bash
curl -X PATCH https://api.feedverse.com/v1/scenarios/123e4567 \
  -H "Authorization: Bearer TOKEN" \
  -F "name=Nouveau nom"
```

**Modifier le code d'invitation :**

```bash
curl -X PATCH https://api.feedverse.com/v1/scenarios/123e4567 \
  -H "Authorization: Bearer TOKEN" \
  -F "invite_code=NEWCODE2025"
```

**Mettre à jour la couverture uniquement :**

```bash
curl -X PATCH https://api.feedverse.com/v1/scenarios/123e4567 \
  -H "Authorization: Bearer TOKEN" \
  -F "cover=@new-cover.jpg"
```

---

### Récupérer les participants d'un scénario

**Endpoint :** `GET /scenarios/:id/players`

**Description :** Récupère la liste complète des utilisateurs participant à un scénario. Retourne les informations de base de chaque participant, incluant le statut de propriétaire. Les résultats sont triés avec le propriétaire en premier, suivi des autres participants par ordre alphabétique.

**Authentification :** Requise

#### Paramètres de route

| Paramètre | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Identifiant unique du scénario |

#### Validation

- L'identifiant doit être au format UUID v4
- Le scénario doit exister dans la base de données
- L'utilisateur doit être authentifié (pas besoin d'être participant pour l'instant)

#### Réponse de succès

**Code :** `200 OK`

**Structure :**

```json
{
  "message": "string",
  "players": [
    {
      "id": "uuid",
      "username": "string",
      "name": "string",
      "avatar_url": "string",
      "is_owner": "boolean"
    }
  ],
  "count": "number"
}
```

#### Champs de la réponse

- **message** : Message de confirmation de succès
- **players** : Tableau des participants du scénario
  - **id** : Identifiant unique de l'utilisateur
  - **username** : Nom d'utilisateur
  - **name** : Nom d'affichage
  - **avatar_url** : URL de l'avatar de l'utilisateur
  - **is_owner** : Indique si l'utilisateur est le propriétaire du scénario
- **count** : Nombre total de participants

#### Exemple de réponse

```json
{
  "message": "Liste des participants récupérée avec succès",
  "players": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "hyunjin_official",
      "name": "Hyunjin",
      "avatar_url": "https://cdn.feedverse.com/users/550e8400.jpg",
      "is_owner": true
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440111",
      "username": "felix_sunshine",
      "name": "Felix",
      "avatar_url": "https://cdn.feedverse.com/users/660e8400.jpg",
      "is_owner": false
    },
    {
      "id": "770e8400-e29b-41d4-a716-446655440222",
      "username": "seungmin_vocals",
      "name": "Seungmin",
      "avatar_url": "https://cdn.feedverse.com/users/770e8400.jpg",
      "is_owner": false
    }
  ],
  "count": 3
}
```

#### Exemple de code

**JavaScript (Fetch API) :**

```javascript
const scenarioId = '123e4567-e89b-12d3-a456-426614174000';

const response = await fetch(`https://api.feedverse.com/v1/scenarios/${scenarioId}/players`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const { players, count } = await response.json();
console.log(`Ce scénario a ${count} participant(s)`);
```

**cURL :**

```bash
curl -X GET https://api.feedverse.com/v1/scenarios/123e4567-e89b-12d3-a456-426614174000/players \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### Codes de statut

| Code | Description |
|------|-------------|
| `200` | Succès - Liste récupérée |
| `400` | Requête invalide - Format UUID incorrect |
| `401` | Non autorisé - Token invalide ou expiré |
| `404` | Non trouvé - Scénario inexistant |
| `500` | Erreur serveur interne |

#### Erreurs possibles

**400 Bad Request :**

```json
{
  "errors": [
    {
      "fields": "id",
      "message": "Format d'identifiant invalide"
    }
  ]
}
```

**404 Not Found :**

```json
{
  "errors": [
    {
      "fields": "id",
      "message": "Scénario introuvable"
    }
  ]
}
```

#### Notes techniques

- **Tri intelligent** : Le propriétaire apparaît toujours en premier, suivi des participants triés alphabétiquement par username
- **Exclusion des comptes supprimés** : Les utilisateurs avec `is_deleted = true` ne sont pas inclus dans les résultats
- **Performance** : Utilise une jointure triple optimisée entre `users`, `scenario_players` et `scenarios`
- **Champ calculé** : `is_owner` est calculé dynamiquement via une comparaison SQL
- **Permissions futures** : La vérification d'appartenance au scénario pourra être ajoutée ultérieurement

#### Cas d'usage

**Afficher la liste des membres :**

- Visualiser tous les participants d'un scénario
- Identifier le propriétaire du scénario
- Afficher les avatars et noms dans une interface utilisateur

**Gestion de scénario :**

- Vérifier qui a accès au scénario
- Préparer l'interface pour inviter de nouveaux participants
- Afficher le nombre total de participants

---

### Transférer la propriété d'un scénario

**Endpoint :** `POST /scenarios/:id/transfer`

**Description :** Transfère la propriété d'un scénario à un autre utilisateur existant. Cette opération est irréversible et modifie le propriétaire officiel du scénario. Le nouveau propriétaire devient automatiquement participant s'il ne l'était pas déjà. En mode campaign, les rôles de Maître du Jeu sont également mis à jour.

**Authentification :** Requise

**Content-Type :** `application/json`

#### Paramètres de route

| Paramètre | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Identifiant unique du scénario dont on veut transférer la propriété |

#### Paramètres du corps de requête

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `newOwnerUserId` | UUID | Oui | Identifiant de l'utilisateur qui deviendra le nouveau propriétaire |

#### Validation des champs

**id (paramètre de route) :**

- Format : UUID v4
- Le scénario doit exister
- L'utilisateur connecté doit être l'actuel propriétaire

**newOwnerUserId :**

- Format : UUID v4
- L'utilisateur doit exister et ne pas être supprimé
- Ne peut pas être le propriétaire actuel (pas de transfert à soi-même)

#### Autorisations

- Seul le propriétaire actuel du scénario (`owner_user_id`) peut transférer la propriété
- L'opération est atomique via transaction SQL

#### Comportement du transfert

**Modifications automatiques :**

1. **Mise à jour du propriétaire** : Le champ `owner_user_id` est modifié
2. **Ajout aux participants** : Si le nouveau propriétaire n'est pas dans `scenario_players`, il est ajouté automatiquement
3. **Gestion des rôles GM (mode campaign uniquement)** :
   - L'ancien propriétaire est retiré de `gm_user_ids`
   - Le nouveau propriétaire est ajouté à `gm_user_ids`
4. **Timestamp** : Le champ `updated_at` est mis à jour

**Transaction SQL** : Toutes ces opérations sont effectuées dans une transaction unique pour garantir la cohérence des données.

#### Réponse de succès

**Code :** `200 OK`

**Structure :**

```json
{
  "message": "string",
  "scenario": {
    "id": "uuid",
    "name": "string",
    "cover": "string",
    "invite_code": "string",
    "owner_user_id": "uuid",
    "description": "string | null",
    "mode": "story | campaign",
    "gm_user_ids": ["uuid"],
    "settings": {},
    "created_at": "timestamp",
    "updated_at": "timestamp"
  }
}
```

#### Exemple de réponse

```json
{
  "message": "Propriété du scénario transférée avec succès",
  "scenario": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "K-Pop Universe",
    "cover": "https://cdn.feedverse.com/covers/kpop-universe.jpg",
    "invite_code": "KPOP2024",
    "owner_user_id": "660e8400-e29b-41d4-a716-446655440111",
    "description": "Un univers narratif K-Pop",
    "mode": "campaign",
    "gm_user_ids": ["660e8400-e29b-41d4-a716-446655440111"],
    "settings": {
      "profileLimitMode": "per_owner",
      "pinnedPostIds": []
    },
    "created_at": "2024-01-15T10:00:00Z",
    "updated_at": "2026-01-17T18:30:00Z"
  }
}
```

#### Exemple de code

**JavaScript (Fetch API) :**

```javascript
const scenarioId = '123e4567-e89b-12d3-a456-426614174000';
const newOwnerId = '660e8400-e29b-41d4-a716-446655440111';

const response = await fetch(`https://api.feedverse.com/v1/scenarios/${scenarioId}/transfer`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    newOwnerUserId: newOwnerId
  })
});

const { scenario } = await response.json();
console.log(`Nouveau propriétaire : ${scenario.owner_user_id}`);
```

**cURL :**

```bash
curl -X POST https://api.feedverse.com/v1/scenarios/123e4567-e89b-12d3-a456-426614174000/transfer \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "newOwnerUserId": "660e8400-e29b-41d4-a716-446655440111"
  }'
```

#### Codes de statut

| Code | Description |
|------|-------------|
| `200` | Succès - Propriété transférée |
| `400` | Requête invalide - Validation échouée ou format UUID incorrect |
| `401` | Non autorisé - Token invalide ou expiré |
| `403` | Interdit - L'utilisateur n'est pas le propriétaire actuel |
| `404` | Non trouvé - Scénario ou nouveau propriétaire inexistant |
| `500` | Erreur serveur interne |

#### Erreurs possibles

**400 Bad Request (UUID scénario invalide) :**

```json
{
  "errors": [
    {
      "fields": "id",
      "message": "Format d'identifiant de scénario invalide"
    }
  ]
}
```

**400 Bad Request (UUID nouveau propriétaire invalide) :**

```json
{
  "errors": [
    {
      "fields": "newOwnerUserId",
      "message": "Format d'identifiant du nouveau propriétaire invalide"
    }
  ]
}
```

**400 Bad Request (transfert à soi-même) :**

```json
{
  "errors": [
    {
      "fields": "newOwnerUserId",
      "message": "Vous êtes déjà propriétaire de ce scénario"
    }
  ]
}
```

**400 Bad Request (champ manquant) :**

```json
{
  "errors": [
    {
      "fields": "newOwnerUserId",
      "message": "L'identifiant du nouveau propriétaire est requis"
    }
  ]
}
```

**403 Forbidden :**

```json
{
  "errors": [
    {
      "fields": "authorization",
      "message": "Seul le propriétaire peut transférer la propriété"
    }
  ]
}
```

**404 Not Found (scénario) :**

```json
{
  "errors": [
    {
      "fields": "id",
      "message": "Scénario introuvable"
    }
  ]
}
```

**404 Not Found (nouveau propriétaire) :**

```json
{
  "errors": [
    {
      "fields": "newOwnerUserId",
      "message": "Le nouvel utilisateur propriétaire est introuvable"
    }
  ]
}
```

#### Notes importantes

- **Irréversibilité** : L'opération ne peut pas être annulée automatiquement. Le nouveau propriétaire devra refaire un transfert pour rendre la propriété.
- **Transaction atomique** : Utilise une transaction SQL avec `BEGIN`/`COMMIT`/`ROLLBACK` pour garantir la cohérence.
- **Ajout automatique aux participants** : Si le nouveau propriétaire n'était pas participant, il est ajouté à `scenario_players`.
- **Mode campaign** : En mode campaign, le tableau `gm_user_ids` est automatiquement mis à jour pour retirer l'ancien owner et ajouter le nouveau.
- **Permissions strictes** : Même les administrateurs ne peuvent pas transférer un scénario s'ils n'en sont pas propriétaires.
- **Vérification d'existence** : Le nouveau propriétaire doit exister et ne pas être supprimé (`is_deleted = false`).

#### Recommandations d'usage

**Avant le transfert** :

1. Confirmer l'identité du nouveau propriétaire
2. Informer le nouveau propriétaire de ses nouvelles responsabilités
3. S'assurer que le nouveau propriétaire est actif dans le scénario

**Après le transfert** :

1. Vérifier que les permissions ont bien été mises à jour
2. Informer tous les participants du changement de propriété
3. Mettre à jour les interfaces utilisateur pour refléter le nouveau propriétaire

**Cas d'usage courants** :

- Passation de pouvoir lors du départ d'un créateur
- Transfert à un co-créateur plus actif
- Changement de responsable pour un scénario de groupe

#### Considérations futures

Pour des fonctionnalités avancées, envisager :

- Système de co-propriétaires multiples
- Historique des transferts de propriété (table d'audit)
- Notifications automatiques au nouveau propriétaire
- Période de confirmation avant transfert effectif
- Restriction temporelle (cooldown entre transferts)

---

## Codes de statut HTTP

### Codes de succès

| Code | Nom | Description |
|------|-----|-------------|
| `200` | OK | Requête réussie, données retournées |
| `201` | Created | Ressource créée avec succès |
| `204` | No Content | Requête réussie, pas de contenu retourné |

### Codes d'erreur client

| Code | Nom | Description |
|------|-----|-------------|
| `400` | Bad Request | Requête invalide ou malformée |
| `401` | Unauthorized | Authentification requise ou token invalide |
| `403` | Forbidden | Accès refusé, permissions insuffisantes |
| `404` | Not Found | Ressource introuvable |
| `409` | Conflict | Conflit avec l'état actuel (ex: doublon) |
| `422` | Unprocessable Entity | Validation des données échouée |

### Codes d'erreur serveur

| Code | Nom | Description |
|------|-----|-------------|
| `500` | Internal Server Error | Erreur interne du serveur |
| `503` | Service Unavailable | Service temporairement indisponible |

---

## Gestion des erreurs

### Format standard des erreurs

Toutes les erreurs suivent un format cohérent pour faciliter le traitement côté client.

**Structure de base :**

```json
{
  "errors": [
    {
      "fields": "string",
      "message": "string"
    }
  ]
}
```

**ou :**

```json
{
  "error": "string"
}
```

### Types d'erreurs

#### Erreurs de validation

Retournées lors de la validation des données d'entrée. Le champ `fields` indique le nom du champ concerné.

**Exemple :**

```json
{
  "errors": [
    {
      "fields": "name",
      "message": "Le nom du scénario doit contenir entre 1 et 100 caractères"
    },
    {
      "fields": "invite_code",
      "message": "Le code d'invitation doit contenir entre 4 et 20 caractères"
    }
  ]
}
```

#### Erreurs d'authentification

Retournées lorsque le token JWT est invalide, expiré ou manquant.

**Exemple :**

```json
{
  "error": "Token invalide ou expiré"
}
```

#### Erreurs d'autorisation

Retournées lorsque l'utilisateur n'a pas les permissions nécessaires.

**Exemple :**

```json
{
  "errors": [
    {
      "fields": "authorization",
      "message": "Vous ne pouvez supprimer que votre propre compte"
    }
  ]
}
```