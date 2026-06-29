const express = require('express');
const router = express.Router();
const { getMonWallet } = require('../controllers/wallet.controller');
const authMiddleware = require('../middlewares/auth.middleware');

/**
 * @swagger
 * tags:
 *   name: Wallet
 *   description: Porte-monnaie interne (solde + transactions)
 */

/**
 * @swagger
 * /wallet:
 *   get:
 *     summary: Mon porte-monnaie (solde + historique)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Solde et liste des transactions
 */
router.get('/', authMiddleware, getMonWallet);

module.exports = router;
