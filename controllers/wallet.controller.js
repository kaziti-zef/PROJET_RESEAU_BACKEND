const { getWalletDetails } = require('../services/wallet.service');

// ============================================
// MON PORTE-MONNAIE (utilisateur connecté) — W1
// Solde + historique des transactions.
// ============================================
const getMonWallet = async (req, res) => {
  try {
    const data = await getWalletDetails(req.user.id, 100);
    return res.status(200).json(data);
  } catch (err) {
    console.error('Erreur wallet:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getMonWallet };
