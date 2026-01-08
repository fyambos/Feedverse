[![fr-FR](https://img.shields.io/badge/lang-fr-green.svg)](https://github.com/fyambos/Feedverse/blob/main/README.md)

# Feedverse

A mobile social network simulation app that enables collaborative co-writing of fiction through shared scenarios.

## Concept

Feedverse is a hybrid platform inspired by **Status** and **Social Maker**, where users create and manage fictional profiles to build immersive social stories together. Each scenario is a shared universe where up to 20 players can interact via posts, messages, and mentions.

### Key Points

- **Multiplayer**: Up to 20 players per scenario
- **Multiple Profiles**: Up to 30 profiles per user in each scenario
- **Co-writing**: Shared permissions to play other players' profiles
- **Full Simulation**: Feed, private messages, mentions, notifications

## Tech Stack

### Frontend

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)

### Backend

![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express&logoColor=white)

### Database

![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)

### Other

![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)

### Platforms

![iOS](https://img.shields.io/badge/iOS-000000?style=for-the-badge&logo=ios&logoColor=white)
![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)

## MVP Features

### Authentication

- Account creation (email/password, iCloud, Google)
- Login/logout
- Password recovery
- Secure session management

### Scenario Management

- Create a scenario
- Invite players (link or code)
- Join a scenario (20 player limit)
- Leave or delete a scenario

### Profile Management

- Create up to 30 profiles per scenario
- Profile picture, bio, date of birth
- Enable/disable multiplayer mode
- View profiles and their owners
- Feed and private messages per profile

### Profile Selector

- Active profile always visible
- Quick switch from any screen
- Display playable profiles (owned + permissions)

### Feed & Posts

- Scenario timeline with infinite scroll
- Create posts with:
  - Text
  - Photos
  - Links with preview
  - Quoted posts
  - Profile mentions
- Deletion by author or scenario owner

### Messaging

- Private conversations between profiles
- Text messages, photos, links, quoted posts
- Dynamic sender profile switching
- Read/unread status
- Group chats

## Data Architecture

### Main Entities

```
User (real player)
↓
Scenario (shared universe, max 20 players)
↓
Profile (fictional character, max 30 per user)
↓
Posts / Messages / Notifications
```


### Permission System

Each profile has a permission system allowing the owner to authorize other players to:

- Post with this profile
- Send messages
- Modify the profile (optional)

## Navigation

### Main Tabs (within a scenario)

1. **Home** - Scenario feed
2. **Search** - Search posts and profiles
3. **Notifications** - Mentions and messages
4. **Messages** - Private conversations
5. **Scenario/Profiles** - Management and settings

## Security

- Strict backend permissions
- Impossible to post with unauthorized profiles
- Isolation of messages and notifications by profile
- Password hashing
- Authorization validation for every action

## Planning

- **MVP Deadline**: December 14, 2026
- **Sprints**: 2-week cycles with reviews
- **Methodology**: Agile with iterative planning

## Future Features

- Full push notifications
- Profile import/export
- Transfer profiles between scenarios
- Post drafts
- Timeline export (screenshots/PDF)
- Advanced roles (admin, moderator)
- Dark mode / Light mode
- Advanced search

## Business Model

(Currently)

- Sponsored posts in feeds
- Featured scenarios in "Explore" tab
- Premium subscription (ad-free)
- In-app purchases (icon customization)

---

**Feedverse** - Where your stories come to life 🌟
