const { getWalletDetails, crediter, debiter } = require('../services/wallet.service');
const pool = require('../config/db');

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

// ============================================
// RECHARGER MON PORTE-MONNAIE — W1
// Approvisionnement simulé (pas de PSP réel) : on crédite le solde.
// ============================================
const rechargerWallet = async (req, res) => {
  const montant = Number(req.body.montant);
  if (!Number.isFinite(montant) || montant <= 0) {
    return res.status(400).json({ message: 'Le montant à recharger doit être un nombre positif.' });
  }
  if (montant > 5_000_000) {
    return res.status(400).json({ message: 'Montant trop élevé pour un rechargement (max 5 000 000).' });
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await crediter(req.user.id, montant, 'RECHARGE', 'Rechargement du porte-monnaie', null, db);
    await db.query('COMMIT');
    const data = await getWalletDetails(req.user.id, 100);
    return res.status(201).json({ message: `Porte-monnaie rechargé de ${montant}.`, ...data });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('Erreur rechargement wallet:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

// ============================================
// RETIRER DE MON PORTE-MONNAIE — W1
// Débit du solde (refusé si solde insuffisant).
// ============================================
const retirerWallet = async (req, res) => {
  const montant = Number(req.body.montant);
  if (!Number.isFinite(montant) || montant <= 0) {
    return res.status(400).json({ message: 'Le montant à retirer doit être un nombre positif.' });
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    try {
      await debiter(req.user.id, montant, 'RETRAIT', 'Retrait du porte-monnaie', null, db, true);
    } catch (e) {
      await db.query('ROLLBACK');
      if (e.code === 'SOLDE_INSUFFISANT') {
        return res.status(400).json({ message: 'Solde insuffisant pour ce retrait.' });
      }
      throw e;
    }
    await db.query('COMMIT');
    const data = await getWalletDetails(req.user.id, 100);
    return res.status(200).json({ message: `Retrait de ${montant} effectué.`, ...data });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('Erreur retrait wallet:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

module.exports = { getMonWallet, rechargerWallet, retirerWallet };