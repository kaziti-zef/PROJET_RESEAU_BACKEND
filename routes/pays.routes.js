const express = require('express');
const router = express.Router();
const { getPays, getVilles } = require('../controllers/pays.controller');

/**
 * @swagger
 * tags:
 *   name: Pays
 *   description: Pays, devises et villes (paramètre pays de la plateforme)
 */

/**
 * @swagger
 * /pays:
 *   get:
 *     summary: Lister les pays disponibles (avec devise)
 *     tags: [Pays]
 *     security: []
 *     responses:
 *       200:
 *         description: Liste des pays (id, code, nom, devise_code, devise_symbole)
 */
router.get('/', getPays);

/**
 * @swagger
 * /pays/villes:
 *   get:
 *     summary: Lister les villes (optionnellement filtrées par pays)
 *     tags: [Pays]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: pays_id
 *         schema: { type: integer }
 *       - in: query
 *         name: code
 *         schema: { type: string }
 *         description: Code ISO du pays (ex CM)
 *     responses:
 *       200:
 *         description: Liste des villes
 */
router.get('/villes', getVilles);

module.exports = router;
