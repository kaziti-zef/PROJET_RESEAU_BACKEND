// ============================================================
//  services/wallet.service.js
//  Porte-monnaie interne (W1) : solde par utilisateur + registre.
//  Toutes les écritures passent par ici pour garantir la cohérence
//  solde ↔ transactions. Montant simulé (pas de PSP réel).
// ============================================================

const pool = require('../config/db');

/** Récupère (ou crée) le wallet d'un utilisateur. Retourne la ligne wallet. */
async function getOrCreateWallet(utilisateurId, client = pool) {
  const existant = await client.query(
    'SELECT * FROM wallets WHERE utilisateur_id = $1',
    [utilisateurId]
  );
  if (existant.rows.length > 0) return existant.rows[0];

  const cree = await client.query(
    'INSERT INTO wallets (utilisateur_id, solde) VALUES ($1, 0) RETURNING *',
    [utilisateurId]
  );
  return cree.rows[0];
}

/** Solde courant (number) d'un utilisateur. */
async function getSolde(utilisateurId, client = pool) {
  const w = await getOrCreateWallet(utilisateurId, client);
  return Number(w.solde);
}

/**
 * Crédite le wallet (+) et journalise la transaction.
 * arrondi au centime. `client` permet de passer dans une transaction SQL.
 */
async function crediter(utilisateurId, montant, type, motif, reservationId = null, client = pool) {
  const m = Math.round(Number(montant) * 100) / 100;
  if (!(m > 0)) return; // rien à créditer
  const w = await getOrCreateWallet(utilisateurId, client);
  await client.query('UPDATE wallets SET solde = solde + $1 WHERE id = $2', [m, w.id]);
  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, montant, type, motif, reservation_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [w.id, m, type, motif || null, reservationId]
  );
}

/**
 * Débite le wallet (−) et journalise. Si `strict` (défaut true), refuse si
 * le solde est insuffisant (lève une erreur SOLDE_INSUFFISANT).
 */
async function debiter(utilisateurId, montant, type, motif, reservationId = null, client = pool, strict = true) {
  const m = Math.round(Number(montant) * 100) / 100;
  if (!(m > 0)) return;
  const w = await getOrCreateWallet(utilisateurId, client);
  if (strict && Number(w.solde) < m) {
    const err = new Error('SOLDE_INSUFFISANT');
    err.code = 'SOLDE_INSUFFISANT';
    throw err;
  }
  await client.query('UPDATE wallets SET solde = solde - $1 WHERE id = $2', [m, w.id]);
  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, montant, type, motif, reservation_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [w.id, -m, type, motif || null, reservationId]
  );
}

/** Solde + N dernières transactions (pour l'affichage du wallet). */
async function getWalletDetails(utilisateurId, limit = 50) {
  const w = await getOrCreateWallet(utilisateurId);
  const tx = await pool.query(
    `SELECT id, montant, type, motif, reservation_id, date_transaction
     FROM wallet_transactions
     WHERE wallet_id = $1
     ORDER BY date_transaction DESC, id DESC
     LIMIT $2`,
    [w.id, limit]
  );
  return { solde: Number(w.solde), transactions: tx.rows };
}

module.exports = {
  getOrCreateWallet,
  getSolde,
  crediter,
  debiter,
  getWalletDetails,
};
