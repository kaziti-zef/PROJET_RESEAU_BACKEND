const express = require('express');
const router = express.Router();
const {
  demanderDevenirHote,
  getStatutVerification,
  getUtilisateursAdmin,
  approuverUtilisateur,
  rejeterUtilisateur,
} = require('../controllers/utilisateur.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');
const uploadCni = require('../config/multerCni');

/**
 * @swagger
 * tags:
 *   name: Utilisateurs
 *   description: Gestion du compte utilisateur (devenir hôte, etc.)
 */

/**
 * @swagger
 * /utilisateurs/devenir-hote:
 *   post:
 *     summary: Déposer une demande pour devenir hôte (Client) — nécessite approbation admin
 *     tags: [Utilisateurs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [telephone, fournisseur, identifiant, photo_cni]
 *             properties:
 *               telephone:
 *                 type: string
 *               fournisseur:
 *                 type: string
 *                 description: Nom du fournisseur de paiement (ex MTN MOBILE MONEY)
 *               identifiant:
 *                 type: string
 *                 description: Identifiant du compte de paiement (ex numéro)
 *               photo_cni:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Demande envoyée, en attente de validation admin
 *       400:
 *         description: Données invalides ou compte déjà HOTE/ADMINISTRATEUR
 *       409:
 *         description: Une demande est déjà en attente
 */
router.post(
  '/devenir-hote',
  authMiddleware,
  roleMiddleware('CLIENT'),
  uploadCni.single('photo_cni'),
  demanderDevenirHote
);

/**
 * @swagger
 * /utilisateurs/statut-verification:
 *   get:
 *     summary: Consulter le statut de sa demande "devenir hôte"
 *     tags: [Utilisateurs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statut courant (NON_DEMANDE, EN_ATTENTE, APPROUVE, REJETE)
 */
router.get('/statut-verification', authMiddleware, getStatutVerification);

/**
 * @swagger
 * /utilisateurs/admin:
 *   get:
 *     summary: Lister les utilisateurs (Admin) — filtrable par statut_verification ou typeCompte
 *     tags: [Utilisateurs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: statut_verification
 *         schema:
 *           type: string
 *           enum: [NON_DEMANDE, EN_ATTENTE, APPROUVE, REJETE]
 *       - in: query
 *         name: typeCompte
 *         schema:
 *           type: string
 *           enum: [CLIENT, HOTE, ADMINISTRATEUR]
 *     responses:
 *       200:
 *         description: Liste des utilisateurs
 */
router.get('/admin', authMiddleware, roleMiddleware('ADMINISTRATEUR'), getUtilisateursAdmin);

/**
 * @swagger
 * /utilisateurs/admin/{id}/approuver:
 *   put:
 *     summary: Approuver une demande "devenir hôte" (Admin)
 *     tags: [Utilisateurs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Utilisateur approuvé, passe HOTE
 *       400:
 *         description: Demande non en attente
 */
router.put('/admin/:id/approuver', authMiddleware, roleMiddleware('ADMINISTRATEUR'), approuverUtilisateur);

/**
 * @swagger
 * /utilisateurs/admin/{id}/rejeter:
 *   put:
 *     summary: Rejeter une demande "devenir hôte" (Admin)
 *     tags: [Utilisateurs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Demande rejetée, compte reste CLIENT
 *       400:
 *         description: Demande non en attente
 */
router.put('/admin/:id/rejeter', authMiddleware, roleMiddleware('ADMINISTRATEUR'), rejeterUtilisateur);

module.exports = router;