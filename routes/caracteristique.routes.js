const express = require('express');
const router = express.Router();
const { getCaracteristiques } = require('../controllers/caracteristique.controller');

/**
 * @swagger
 * tags:
 *   name: Caracteristiques
 *   description: Catalogue des caractéristiques intrinsèques du logement
 */

/**
 * @swagger
 * /caracteristiques:
 *   get:
 *     summary: Lister les caractéristiques disponibles (liste fixe)
 *     tags: [Caracteristiques]
 *     security: []
 *     responses:
 *       200:
 *         description: Liste des caractéristiques (id, code, nom)
 */
router.get('/', getCaracteristiques);

module.exports = router;
