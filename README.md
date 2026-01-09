[![en](https://img.shields.io/badge/lang-en-red.svg)](https://github.com/fyambos/Feedverse/blob/main/README.en.md)

# Feedverse

App mobile de simulation de réseau social qui permet de co-écriture en collaboration des fictions à travers des scénarios partagés.

## Concept

Feedverse est une plateforme hybride de **réseaux sociaux** et **jeu de roles**, où les utilisateurs créent et gèrent des profils fictifs pour construire ensemble des histoires sociales immersives. Chaque scénario est un univers partagé où jusqu'à 20 joueurs peuvent interagir via posts, messages et mentions.

### Points clés

- **Multijoueur** : Jusqu'à 20 joueurs par scénario
- **Profils multiples** : Jusqu'à 30 profils par utilisateur dans chaque scénario
- **Co-écriture** : Permissions partagées pour jouer les profils d'autres joueurs
- **Simulation complète** : Feed, messages privés, mentions, notifications

## Stack Technique

### Frontend

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)

### Backend

![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express&logoColor=white)

### Base de données

![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)

### Autres

![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)

### Plateformes

![iOS](https://img.shields.io/badge/iOS-000000?style=for-the-badge&logo=ios&logoColor=white)
![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)

## Fonctionnalités MVP

### Authentification

- Création de compte (email/mot de passe, iCloud, Google)
- Connexion/déconnexion
- Récupération de mot de passe
- Gestion de session sécurisée

### Gestion des scénarios

- Créer un scénario
- Inviter des joueurs (lien ou code)
- Rejoindre un scénario (limite 20 joueurs)
- Quitter ou supprimer un scénario

### Gestion des profils

- Créer jusqu'à 30 profils par scénario
- Photo de profil, bio, date de naissance
- Activer/désactiver le mode multijoueur
- Voir les profils et leurs propriétaires
- Feed et messages privés par profil

### Sélecteur de profil

- Profil actif toujours visible
- Changement rapide depuis n'importe quel écran
- Affichage des profils jouables (propriété + permissions)

### Feed & Posts

- Timeline du scénario avec infinite scroll
- Création de posts avec :
  - Texte
  - Photos
  - Liens avec preview
  - Posts cités (quote)
  - Mentions de profils
- Suppression par l'auteur ou l'owner du scénario

### Messagerie

- Conversations privées entre profils
- Messages texte, photos, liens, posts cités
- Changement de profil expéditeur dynamique
- Statut lu/non lu
- Group chats

## Architecture des données

### Entités principales

```
Utilisateur (joueur réel)
  ↓
Scénario (univers partagé, max 20 joueurs)
  ↓
Profil (personnage fictif, max 30 par utilisateur)
  ↓
Posts / Messages / Notifications
```

### Système de permissions

Chaque profil dispose d'un système de permissions permettant au propriétaire d'autoriser d'autres joueurs à :

- Poster avec ce profil
- Envoyer des messages
- Modifier le profil (optionnel)

## Navigation

### Onglets principaux (dans un scénario)

1. **Home** - Feed du scénario
2. **Search** - Recherche de posts et profils
3. **Notifications** - Mentions et messages
4. **Messages** - Conversations privées
5. **Scénario/Profils** - Gestion et paramètres

## Sécurité

- Permissions strictes côté backend
- Impossibilité de poster avec un profil non autorisé
- Isolation des messages et notifications par profil
- Hashage des mots de passe
- Validation des autorisations à chaque action

## Planning

- **Deadline MVP** : 14 décembre 2026
- **Sprints** : Cycles de 2 semaines avec review
- **Méthodologie** : Agile avec planification itérative

## Fonctionnalités futures

- Notifications push complètes
- Import/Export de profils
- Transfert de profils entre scénarios
- Brouillons de posts
- Export de timeline (screenshots/PDF)
- Rôles avancés (admin, modérateur)
- Dark mode / Light mode
- Recherche avancée

### Mode Campagne

Un mode "Campagne" optionnel permettant d'activer des fiches de personnage complètes pour les profils.

- Chaque fiche contient des statistiques (PV, niveau, caractéristiques, compétences, inventaire, etc.).
- Le Game Master (GM) peut modifier les fiches à chaque tour (appliquer dégâts, soins, états, buffs/debuffs) via une interface dédiée.
- Les modifications peuvent être appliquées individuellement ou en lot (ex. "GM: -1 PV à ces personnages").
- Les actions du GM peuvent automatiquement générer un post récapitulatif dans le scénario pour tenir les joueurs informés.
- Les permissions sont gérées côté backend : seules les personnes autorisées (GM et propriétaires selon configuration) peuvent modifier une fiche.

Ce mode facilite les parties de type campagne / JDR en fournissant un système de suivi des personnages et des mises à jour centralisées par le GM.

## Modèle économique

(Pas encore implémenté)

- Posts sponsorisés dans les feeds
- Scénarios featured dans l'onglet "Explore"
- Abonnement premium (sans publicité)
- Achats in-app (personnalisation d'icônes)

---

**Feedverse** - Où vos histoires prennent vie 🌟
