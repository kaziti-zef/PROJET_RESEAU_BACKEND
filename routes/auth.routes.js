const express = require('express');
const router = express.Router();
const { inscription, connexion, getProfil, changerMotDePasse } = require('../controllers/auth.controller');
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
 *     summary: Créer un compte (Client)
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
 *                 enum: [CLIENT]
 *                 description: Seul CLIENT est autorisé à l'inscription. Le passage à HOTE se fait par approbation admin.
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

/**
 * @swagger
 * /auth/mot-de-passe:
 *   put:
 *     summary: Changer son mot de passe (utilisateur connecté)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ancienMotDePasse, nouveauMotDePasse]
 *             properties:
 *               ancienMotDePasse:
 *                 type: string
 *               nouveauMotDePasse:
 *                 type: string
 *     responses:
 *       200:
 *         description: Mot de passe modifié avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié ou ancien mot de passe incorrect
 *       404:
 *         description: Utilisateur introuvable
 */
router.put('/mot-de-passe', authMiddleware, changerMotDePasse);

module.exports = router;