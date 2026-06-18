const express = require('express');
const router = express.Router();
const { getEquipements } = require('../controllers/equipement.controller');

/**
 * @swagger
 * /equipements:
 *   get:
 *     summary: Lister les équipements disponibles (liste fixe)
 *     tags: [Equipements]
 *     security: []
 *     responses:
 *       200:
 *         description: Liste des équipements (id, code, nom)
 */
router.get('/', getEquipements);

module.exports = router;
