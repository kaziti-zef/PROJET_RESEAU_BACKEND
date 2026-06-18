const express = require('express');
const router = express.Router();
const { laisserAvis, getAvisAnnonce, getMesAvis, peutNoter } = require('../controllers/avis.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');

/**
 * @swagger
 * tags:
 *   name: Evaluations
 *   description: Evaluations et notes sur les chambres
 */

/**
 * @swagger 
 * /evaluations:
 *   post:
 *     summary: Laisser un avis (Client) — réservation TERMINEE, ou CONFIRMEE à partir de 50% de la durée du séjour
 *     tags: [Evaluations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true 
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reservation_id, note]
 *             properties:
 *               reservation_id:
 *                 type: integer
 *               note:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               commentaire:
 *                 type: string
 *     responses:
 *       201:
 *         description: Avis publié
 *       400:
 *         description: Réservation non éligible (non confirmée, ou mi-durée non atteinte)
 *       409:
 *         description: Avis déjà posté pour cette réservation
 */
router.post('/', authMiddleware, roleMiddleware('CLIENT'), laisserAvis);

/**
 * @swagger
 * /evaluations/peut-noter/{reservation_id}:
 *   get:
 *     summary: Indique si le client peut laisser un avis pour cette réservation (Client)
 *     tags: [Evaluations]
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
 *         description: "{ peut_noter: boolean, raison?, date_a_partir_de? }"
 *       404:
 *         description: Réservation introuvable
 */
router.get('/peut-noter/:id', authMiddleware, roleMiddleware('CLIENT'), peutNoter);

/**
 * @swagger
 * /evaluations/mes-avis:
 *   get:
 *     summary: Voir tous ses avis (Client)
 *     tags: [Evaluations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des avis du client
 */
router.get('/mes-avis', authMiddleware, roleMiddleware('CLIENT'), getMesAvis);

/**
 * @swagger
 * /evaluations/annonce/{annonce_id}:
 *   get:
 *     summary: Voir les avis d'une annonce (Public)
 *     tags: [Evaluations]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: annonce_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Avis et note moyenne de l'annonce
 */
router.get('/annonce/:annonce_id', getAvisAnnonce);

module.exports = router;