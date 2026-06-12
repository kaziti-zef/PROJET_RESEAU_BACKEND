const express = require('express');
const router = express.Router();
const { inscription, connexion, getProfil } = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Inscription et connexion
 */

/**
 * @swagger
 * /auth/inscription:
 *   post:
 *     summary: Créer un compte (Client ou Hôte)
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, nom, prenom, mot_de_passe, role]
 *             properties:
 *               email:
 *                 type: string
 *               nom:
 *                 type: string
 *               prenom:
 *                 type: string
 *               mot_de_passe:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [CLIENT, HOTE]
 *               raison_sociale:
 *                 type: string
 *                 description: Obligatoire si role = HOTE
 *     responses:
 *       201:
 *         description: Inscription réussie, token retourné
 *       400:
 *         description: Données invalides
 *       409:
 *         description: Email déjà utilisé
 */
router.post('/inscription', inscription);

/**
 * @swagger
 * /auth/connexion:
 *   post:
 *     summary: Se connecter
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, mot_de_passe]
 *             properties:
 *               email:
 *                 type: string
 *               mot_de_passe:
 *                 type: string
 *     responses:
 *       200:
 *         description: Connexion réussie, token retourné
 *       401:
 *         description: Identifiants incorrects
 */
router.post('/connexion', connexion);

/**
 * @swagger
 * /auth/profil:
 *   get:
 *     summary: Récupérer son profil
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profil de l'utilisateur connecté
 *       401:
 *         description: Non authentifié
 */
router.get('/profil', authMiddleware, getProfil);

module.exports = router;
