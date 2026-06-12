const express = require('express');
const router = express.Router();
const { effectuerPaiement, getPaiement } = require('../controllers/paiement.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');

/**
 * @swagger
 * tags:
 *   name: Paiements
 *   description: Gestion des paiements (simulés)
 */

/**
 * @swagger
 * /paiements:
 *   post:
 *     summary: Effectuer un paiement pour une réservation confirmée (Client)
 *     tags: [Paiements]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reservation_id, mode_paiement]
 *             properties:
 *               reservation_id:
 *                 type: integer
 *               mode_paiement:
 *                 type: string
 *                 enum: [CARTE, MOBILE_MONEY, ESPECES]
 *     responses:
 *       201:
 *         description: Paiement effectué avec succès
 *       400:
 *         description: Réservation non confirmée ou données invalides
 *       409:
 *         description: Paiement déjà effectué
 */
router.post('/', authMiddleware, roleMiddleware('CLIENT'), effectuerPaiement);

/**
 * @swagger
 * /paiements/reservation/{reservation_id}:
 *   get:
 *     summary: Détails du paiement d'une réservation
 *     tags: [Paiements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reservation_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Détails du paiement
 *       404:
 *         description: Paiement introuvable
 */
router.get('/reservation/:reservation_id', authMiddleware, getPaiement);

module.exports = router;
