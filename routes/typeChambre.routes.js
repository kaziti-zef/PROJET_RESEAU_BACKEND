const express = require('express');
const router = express.Router();
const { getTypesChambre } = require('../controllers/typeChambre.controller');

/**
 * @swagger
 * tags:
 *   name: TypesChambre
 *   description: Catalogue des types de chambre
 */

/**
 * @swagger
 * /types-chambre:
 *   get:
 *     summary: Lister les types de chambre (liste fixe)
 *     tags: [TypesChambre]
 *     security: []
 *     responses:
 *       200:
 *         description: Liste des types (id, code, nom)
 */
router.get('/', getTypesChambre);

module.exports = router;
