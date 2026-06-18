const express = require('express');
const router = express.Router();
const { creerAdmin, getAdmins } = require('../controllers/superAdmin.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const superAdminMiddleware = require('../middlewares/superAdmin.middleware');

/**
 * @swagger
 * tags:
 *   name: SuperAdmin
 *   description: Actions réservées au super-administrateur (gestion des admins)
 */

/**
 * @swagger
 * /admin/admins:
 *   get:
 *     summary: Lister les administrateurs (Super-admin)
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des comptes ADMINISTRATEUR
 *       403:
 *         description: Réservé au super-admin
 */
router.get('/admins', authMiddleware, superAdminMiddleware, getAdmins);

/**
 * @swagger
 * /admin/admins:
 *   post:
 *     summary: Créer un nouvel administrateur (Super-admin uniquement)
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, nom, prenom, motDePasse]
 *             properties:
 *               email:
 *                 type: string
 *               nom:
 *                 type: string
 *               prenom:
 *                 type: string
 *               motDePasse:
 *                 type: string
 *     responses:
 *       201:
 *         description: Administrateur créé
 *       403:
 *         description: Réservé au super-admin
 *       409:
 *         description: Email déjà utilisé
 */
router.post('/admins', authMiddleware, superAdminMiddleware, creerAdmin);

module.exports = router;