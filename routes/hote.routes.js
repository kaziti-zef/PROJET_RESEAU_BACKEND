const express = require('express');
const router = express.Router();
const { getGainsHote } = require('../controllers/hote.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');

/**
 * @swagger
 * tags:
 *   name: Hote
 *   description: Espace hôte (finance, gains)
 */

/**
 * @swagger
 * /hote/gains:
 *   get:
 *     summary: Récapitulatif des gains de l'hôte (brut, commission, net)
 *     tags: [Hote]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Totaux et détail par annonce
 *       403:
 *         description: Accès réservé aux hôtes
 */
router.get('/gains', authMiddleware, roleMiddleware('HOTE'), getGainsHote);

module.exports = router;
