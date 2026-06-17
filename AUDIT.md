# Audit backend — Room Renting (KamerStay)

Date : 2026-06-17. Périmètre demandé : **correction des écarts métier** + **audit qualité & sécurité**.

## 🔴 Écarts critiques corrigés

| # | Problème | Correctif |
|---|----------|-----------|
| 1 | **JWT vs rôle** : token signé avec `typeCompte`, mais `role.middleware.js` lit `req.user.role` → **toutes** les routes à rôle renvoyaient 403. | Token signé avec `role` (+ `typeCompte` conservé). `auth.controller.js` |
| 2 | **Bootstrap BDD incohérent** : `server.js` exécute `config/initDB.js` qui créait un schéma (`personnes`, `prix`, `date_debut`…) **différent** de celui que les controllers interrogent (`utilisateurs`, `prixParNuit`, `idReservation`, `evaluations`, `mode_paiement`…). Sur une base neuve, `npm run dev` créait les mauvaises tables → toutes les requêtes échouaient. | `config/initDB.js` réécrit pour correspondre **exactement** aux controllers. |
| 3 | **Enum sans `REFUSEE`** : `refuserReservation` écrit `statut='REFUSEE'`, valeur absente de l'enum d'origine → erreur SQL. | Ajout de `REFUSEE` à `typestatutr_enum` (+ `ALTER TYPE … ADD VALUE IF NOT EXISTS`). |
| 4 | **Avis impossibles (RG15)** : un avis exige `statut='TERMINEE'`, mais aucune réservation ne passait jamais à TERMINEE. | Helper `marquerReservationsTerminees()` (CONFIRMEE + `dateFin < CURRENT_DATE` → TERMINEE), appelé dans `getMesReservations`, `getReservationsHote` et `laisserAvis`. |
| 5 | **RG8 non appliqué** : une annonce avec réservations futures pouvait être supprimée. | `supprimerAnnonce` bloque (409) s'il existe des réservations non annulées avec `dateFin >= CURRENT_DATE`. |

## 🟠 Durcissement des validations (écarts mineurs)

- `inscription` : format d'email vérifié + mot de passe ≥ 6 caractères (front aligné : `minLength=6`).
- `creerAnnonce` : `prixParNuit > 0` et `capacite ≥ 1`.
- `creerReservation` : `nombrePersonnes ≥ 1` et date d'arrivée non passée.
- `annulerReservation` : lit désormais `req.user.role` (cohérent avec le reste), au lieu de `typeCompte`.

## 🟢 Bonnes pratiques déjà en place

- Mots de passe **hachés bcrypt** (RG4).
- **Requêtes paramétrées** (`$1, $2…`) partout → pas d'injection SQL.
- JWT signé (HS256), `auth.middleware` sur les routes protégées, `role.middleware` opérationnel.
- `try/catch` systématiques + gestionnaire d'erreurs global ; routes documentées **Swagger** (`/api-docs`).
- Détection de **conflits de dates** (`OVERLAPS`) à la création et modification de réservation (RG9/RG10).

## 🔵 Recommandations restantes (non appliquées)

| Sujet | Recommandation | Pourquoi non fait |
|-------|----------------|-------------------|
| En-têtes HTTP | Ajouter `helmet` | nécessite `npm install` |
| Brute force | `express-rate-limit` sur `/api/auth/*` | nécessite `npm install` |
| CORS | Restreindre `origin` via `CORS_ORIGIN` au lieu de `*` (dev OK) | choix de déploiement |
| Révocation token | Liste noire / Redis (déconnexion réelle) | dépend de l'infra |
| Schéma obsolète | Supprimer/aligner `sql/init.sql` (désormais redondant avec `initDB.js`, et lui-même incohérent : `paiements.modePaiement` ≠ `mode_paiement`) | éviter toute confusion |
| Tests | Ajouter des tests d'intégration des endpoints | hors périmètre |

> ⚠️ **Base existante** : `initDB.js` utilise `CREATE TABLE IF NOT EXISTS` (non destructif). Si une base avait déjà été créée avec l'ancien schéma incohérent, il faut la recréer (drop) ou migrer pour bénéficier du schéma corrigé.
