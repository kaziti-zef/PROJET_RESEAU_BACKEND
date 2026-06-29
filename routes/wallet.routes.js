const express = require('express');
const router = express.Router();
const { getMonWallet, rechargerWallet, retirerWallet } = require('../controllers/wallet.controller');
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

/**
 * @swagger
 * /wallet/recharger:
 *   post:
 *     summary: Recharger mon porte-monnaie (montant simulé)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Solde mis à jour après rechargement
 */
router.post('/recharger', authMiddleware, rechargerWallet);

/**
 * @swagger
 * /wallet/retirer:
 *   post:
 *     summary: Retirer du solde de mon porte-monnaie
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Solde mis à jour après retrait
 */
router.post('/retirer', authMiddleware, retirerWallet);

module.exports = router;