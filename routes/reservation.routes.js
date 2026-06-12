const express = require('express');
const router = express.Router();
const {
  creerReservation,
  getMesReservations,
  getReservationsHote,
  confirmerReservation,
  annulerReservation,
} = require('../controllers/reservation.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');

/**
 * @swagger
 * tags:
 *   name: Réservations
 *   description: Gestion des réservations de chambres
 */

/**
 * @swagger
 * /reservations:
 *   post:
 *     summary: Créer une réservation (Client uniquement)
 *     tags: [Réservations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [annonce_id, date_debut, date_fin, nb_personnes]
 *             properties:
 *               annonce_id:
 *                 type: integer
 *               date_debut:
 *                 type: string
 *                 format: date
 *               date_fin:
 *                 type: string
 *                 format: date
 *               nb_personnes:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Réservation créée, en attente de confirmation
 *       409:
 *         description: Conflit de dates
 */
router.post('/', authMiddleware, roleMiddleware('CLIENT'), creerReservation);

/**
 * @swagger
 * /reservations/mes-reservations:
 *   get:
 *     summary: Voir ses réservations (Client)
 *     tags: [Réservations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des réservations du client
 */
router.get('/mes-reservations', authMiddleware, roleMiddleware('CLIENT'), getMesReservations);

/**
 * @swagger
 * /reservations/hote:
 *   get:
 *     summary: Voir les réservations de ses chambres (Hôte)
 *     tags: [Réservations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des réservations pour les annonces de l'hôte
 */
router.get('/hote', authMiddleware, roleMiddleware('HOTE'), getReservationsHote);

/**
 * @swagger
 * /reservations/{id}/confirmer:
 *   put:
 *     summary: Confirmer une réservation (Hôte)
 *     tags: [Réservations]
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
 *         description: Réservation confirmée
 *       403:
 *         description: Non autorisé
 */
router.put('/:id/confirmer', authMiddleware, roleMiddleware('HOTE'), confirmerReservation);

/**
 * @swagger
 * /reservations/{id}/annuler:
 *   put:
 *     summary: Annuler une réservation (Client ou Hôte)
 *     tags: [Réservations]
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
 *         description: Réservation annulée
 */
router.put('/:id/annuler', authMiddleware, annulerReservation);

module.exports = router;
