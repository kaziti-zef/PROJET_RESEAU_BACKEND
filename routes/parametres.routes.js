const express = require('express');
const router = express.Router();
const { lireParametres, majParametres, getFinancePlateforme } = require('../controllers/parametres.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');
const superAdminMiddleware = require('../middlewares/superAdmin.middleware');

/**
 * @swagger
 * tags:
 *   name: Parametres
 *   description: Paramètres financiers de la plateforme (commission, remboursements)
 */

/**
 * @swagger
 * /admin/parametres:
 *   get:
 *     summary: Lire les paramètres plateforme (Admin)
 *     tags: [Parametres]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Paramètres (commission, politique de remboursement) }
 */
router.get('/parametres', authMiddleware, roleMiddleware('ADMINISTRATEUR'), lireParametres);

/**
 * @swagger
 * /admin/parametres:
 *   put:
 *     summary: Mettre à jour les paramètres plateforme (Super-admin)
 *     tags: [Parametres]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               commission_pct: { type: number }
 *               remb_full_jours: { type: integer }
 *               remb_partiel_jours: { type: integer }
 *               remb_partiel_pct: { type: number }
 *     responses:
 *       200: { description: Paramètres mis à jour }
 *       403: { description: Réservé au super-admin }
 */
router.put('/parametres', authMiddleware, superAdminMiddleware, majParametres);

/**
 * @swagger
 * /admin/finance:
 *   get:
 *     summary: Synthèse financière de la plateforme (Super-admin)
 *     tags: [Parametres]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Volume, commission brute/nette, remboursements }
 *       403: { description: Réservé au super-admin }
 */
router.get('/finance', authMiddleware, superAdminMiddleware, getFinancePlateforme);

module.exports = router;
