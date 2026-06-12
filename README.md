# 🏠 Room Renting API — Backend

Backend Node.js / PostgreSQL / Swagger pour une application de location de chambres (style Airbnb).

---

## 🚀 Installation

### 1. Cloner et installer les dépendances

```bash
npm install
```

### 2. Configurer l'environnement

Éditer le fichier `.env` :

```env
PORT=4000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tonMotDePasse
DB_NAME=room_renting_db
JWT_SECRET=room_renting_super_secret_key_2024
JWT_EXPIRES_IN=7d
UPLOAD_PATH=uploads/images
```

### 3. Créer la base de données PostgreSQL

```bash
psql -U postgres -c "CREATE DATABASE room_renting_db;"
psql -U postgres -d room_renting_db -f sql/init.sql
```

### 4. Démarrer le serveur
 
```bash
# Production
npm start

# Développement (avec rechargement automatique)
npm run dev
```

---

## 📚 Documentation API

Swagger disponible sur : **http://localhost:4000/api-docs**

---

## 🔌 Socket.io — Notifications temps réel

Connexion côté client :

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:4000');

// Rejoindre sa room personnelle après connexion
socket.emit('rejoindre', { userId: 5, role: 'CLIENT' });

// Écouter les événements
socket.on('reservation_confirmee', (data) => {
  console.log('✅ Réservation confirmée !', data);
});

socket.on('nouvelle_reservation', (data) => {
  console.log('🔔 Nouvelle réservation reçue !', data);
});

socket.on('reservation_annulee', (data) => {
  console.log('❌ Réservation annulée', data);
});
```

---

## 📋 Routes disponibles

### Auth
| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| POST | `/api/auth/inscription` | Public | Créer un compte CLIENT ou HOTE |
| POST | `/api/auth/connexion` | Public | Se connecter |
| GET | `/api/auth/profil` | Authentifié | Voir son profil |

### Annonces
| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| GET | `/api/annonces` | Public | Lister annonces (filtres: ville, capacite, prix) |
| GET | `/api/annonces/:id` | Public | Détail d'une annonce |
| GET | `/api/annonces/mes-annonces` | HOTE | Ses propres annonces |
| POST | `/api/annonces` | HOTE | Créer une annonce (multipart/form-data) |
| PUT | `/api/annonces/:id` | HOTE | Modifier une annonce |
| DELETE | `/api/annonces/:id` | HOTE | Supprimer une annonce |
| DELETE | `/api/annonces/:id/images/:imageId` | HOTE | Supprimer une image |

### Réservations
| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| POST | `/api/reservations` | CLIENT | Créer une réservation |
| GET | `/api/reservations/mes-reservations` | CLIENT | Ses réservations |
| GET | `/api/reservations/hote` | HOTE | Réservations de ses chambres |
| PUT | `/api/reservations/:id/confirmer` | HOTE | Confirmer une réservation |
| PUT | `/api/reservations/:id/annuler` | CLIENT/HOTE | Annuler une réservation |

### Paiements
| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| POST | `/api/paiements` | CLIENT | Payer une réservation confirmée |
| GET | `/api/paiements/reservation/:id` | Authentifié | Détail d'un paiement |

### Avis
| Méthode | Route | Accès | Description |
|---------|-------|-------|-------------|
| POST | `/api/avis` | CLIENT | Laisser un avis (après réservation TERMINEE) |
| GET | `/api/avis/annonce/:id` | Public | Avis d'une annonce |
| GET | `/api/avis/mes-avis` | CLIENT | Ses propres avis |

---

## 🗄️ Structure du projet

```
room-renting-backend/
├── config/
│   ├── db.js           ← Connexion PostgreSQL
│   ├── multer.js       ← Upload d'images
│   └── swagger.js      ← Configuration Swagger
├── controllers/
│   ├── auth.controller.js
│   ├── annonce.controller.js
│   ├── reservation.controller.js
│   ├── paiement.controller.js
│   └── avis.controller.js
├── middlewares/
│   ├── auth.middleware.js   ← Vérification JWT
│   └── role.middleware.js   ← Vérification CLIENT/HOTE
├── routes/
│   ├── auth.routes.js
│   ├── annonce.routes.js
│   ├── reservation.routes.js
│   ├── paiement.routes.js
│   └── avis.routes.js
├── sockets/
│   └── reservation.socket.js  ← Notifications temps réel
├── sql/
│   └── init.sql               ← Script création BDD
├── uploads/images/            ← Images uploadées
├── .env
├── app.js
├── server.js
└── package.json
```

---

## 🧪 Comptes de test

| Email | Mot de passe | Rôle |
|-------|-------------|------|
| hote@test.com | password123 | HOTE |
| client@test.com | password123 | CLIENT |
