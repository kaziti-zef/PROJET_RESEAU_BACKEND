const express = require('express');
const router = express.Router();
const {
  creerAnnonce,
  getAnnonces,
  getAnnonceById,
  getMesAnnonces,
  modifierAnnonce,
  supprimerAnnonce,
  supprimerImage,
} = require('../controllers/annonce.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');
const upload = require('../config/multer');

/**
 * @swagger
 * tags:
 *   name: Annonces
 *   description: Gestion des annonces de chambres
 */

/**
 * @swagger
 * /annonces:
 *   get:
 *     summary: Lister toutes les annonces disponibles (avec filtres)
 *     tags: [Annonces]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: ville
 *         schema:
 *           type: string
 *       - in: query
 *         name: capacite
 *         schema:
 *           type: integer
 *       - in: query
 *         name: prix_min
 *         schema:
 *           type: number
 *       - in: query
 *         name: prix_max
 *         schema:
 *           type: number
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Liste des annonces avec pagination
 */
router.get('/', getAnnonces);

/**
 * @swagger
 * /annonces/mes-annonces:
 *   get:
 *     summary: Voir ses propres annonces (Hôte uniquement)
 *     tags: [Annonces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des annonces de l'hôte connecté
 *       403:
 *         description: Accès refusé
 */
router.get('/mes-annonces', authMiddleware, roleMiddleware('HOTE'), getMesAnnonces);

/**
 * @swagger
 * /annonces/{id}:
 *   get:
 *     summary: Détail d'une annonce
 *     tags: [Annonces]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Détails de l'annonce
 *       404:
 *         description: Annonce introuvable
 */
router.get('/:id', getAnnonceById);

/**
 * @swagger
 * /annonces:
 *   post:
 *     summary: Créer une annonce (Hôte uniquement)
 *     tags: [Annonces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [titre, ville, prix, capacite]
 *             properties:
 *               titre:
 *                 type: string
 *               description:
 *                 type: string
 *               ville:
 *                 type: string
 *               quartier:
 *                 type: string
 *               adresse:
 *                 type: string
 *               prix:
 *                 type: number
 *               capacite:
 *                 type: integer
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Annonce créée
 *       403:
 *         description: Accès refusé (CLIENT ne peut pas créer)
 */
router.post('/', authMiddleware, roleMiddleware('HOTE'), upload.array('images', 5), creerAnnonce);

/**
 * @swagger
 * /annonces/{id}:
 *   put:
 *     summary: Modifier une annonce (Hôte propriétaire)
 *     tags: [Annonces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               titre:
 *                 type: string
 *               description:
 *                 type: string
 *               ville:
 *                 type: string
 *               prix:
 *                 type: number
 *               capacite:
 *                 type: integer
 *               disponible:
 *                 type: boolean
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Annonce mise à jour
 */
router.put('/:id', authMiddleware, roleMiddleware('HOTE'), upload.array('images', 5), modifierAnnonce);

/**
 * @swagger
 * /annonces/{id}:
 *   delete:
 *     summary: Supprimer une annonce (Hôte propriétaire)
 *     tags: [Annonces]
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
 *         description: Annonce supprimée
 *       403:
 *         description: Non autorisé
 */
router.delete('/:id', authMiddleware, roleMiddleware('HOTE'), supprimerAnnonce);

/**
 * @swagger
 * /annonces/{id}/images/{imageId}:
 *   delete:
 *     summary: Supprimer une image d'une annonce (Hôte propriétaire)
 *     tags: [Annonces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: imageId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Image supprimée
 */
router.delete('/:id/images/:imageId', authMiddleware, roleMiddleware('HOTE'), supprimerImage);

module.exports = router;
