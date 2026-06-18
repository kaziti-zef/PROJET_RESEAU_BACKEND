const express = require('express');
const router = express.Router();
const { getAnnoncesAdmin, supprimerAnnonceAdmin } = require('../controllers/adminAnnonce.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Actions réservées aux administrateurs
 */

/**
 * @swagger
 * /admin/annonces:
 *   get:
 *     summary: Lister toutes les annonces, tous statuts confondus (Admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste complète des annonces
 */
router.get('/annonces', authMiddleware, roleMiddleware('ADMINISTRATEUR'), getAnnoncesAdmin);

/**
 * @swagger
 * /admin/annonces/{id}:
 *   delete:
 *     summary: Supprimer une annonce, quel que soit son propriétaire (Admin)
 *     tags: [Admin]
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
 *       404:
 *         description: Annonce introuvable
 */
router.delete('/annonces/:id', authMiddleware, roleMiddleware('ADMINISTRATEUR'), supprimerAnnonceAdmin);

module.exports = router;