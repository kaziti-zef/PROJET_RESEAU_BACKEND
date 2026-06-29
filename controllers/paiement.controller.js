const pool = require('../config/db');
const { getCommissionTaux } = require('../services/parametres.service');
const wallet = require('../services/wallet.service');

// ============================================
// EFFECTUER UN PAIEMENT (Client)
// Le paiement confirme automatiquement la réservation.
// Modes : CARTE, MOBILE_MONEY, ESPECES, WALLET (porte-monnaie).
// Finance (O1) : commission prélevée (taux réglé par le super-admin),
// net crédité sur le porte-monnaie de l'hôte (W1).
// ============================================
const effectuerPaiement = async (req, res) => {
  const { reservation_id, mode_paiement } = req.body;
  const client_id = req.user.id;

  if (!reservation_id || !mode_paiement) {
    return res.status(400).json({ message: 'reservation_id et mode_paiement sont obligatoires' });
  }

  const modesValides = ['CARTE', 'MOBILE_MONEY', 'ESPECES', 'WALLET'];
  if (!modesValides.includes(mode_paiement)) {
    return res.status(400).json({ message: `Mode invalide. Choisir : ${modesValides.join(', ')}` });
  }

  const db = await pool.connect();
  try {
    // Vérifier que la réservation appartient au client et est EN_ATTENTE
    const reservation = await db.query(
      `SELECT r.*, a.prixParNuit, a.hote_id,
              (EXTRACT(DAY FROM r.dateFin::timestamp - r.dateDebut::timestamp)) AS nb_nuits
       FROM reservations r
       JOIN annonces a ON r.annonce_id = a.id
       WHERE r.idReservation = $1 AND r.client_id = $2`,
      [reservation_id, client_id]
    );

    if (reservation.rows.length === 0) {
      return res.status(404).json({ message: 'Réservation introuvable' });
    }

    const resa = reservation.rows[0];

    if (resa.statut === 'REFUSEE') { return res.status(400).json({ message: 'Cette réservation a été refusée par l\'hôte' }); }
    if (resa.statut === 'ANNULEE') { return res.status(400).json({ message: 'Cette réservation est annulée' }); }
    if (resa.statut !== 'EN_ATTENTE') { return res.status(400).json({ message: 'Cette réservation a déjà été payée' }); }

    const paiementExistant = await db.query('SELECT id FROM paiements WHERE reservation_id = $1', [reservation_id]);
    if (paiementExistant.rows.length > 0) {
      return res.status(409).json({ message: 'Cette réservation a déjà été payée' });
    }

    // Montant (paiement partiel K1 = acompte 50%)
    const nbNuits = Math.max(1, parseInt(resa.nb_nuits));
    const montantDu = parseFloat(resa.montanttotal);
    const partiel = req.body.paiement_partiel === true || req.body.paiement_partiel === 'true';
    const montant = partiel ? Math.round(montantDu * 0.5 * 100) / 100 : montantDu;
    const statutPaiement = partiel ? 'PARTIEL' : 'COMPLET';

    // Commission (taux réglé par le super-admin) et net hôte
    const tauxCommission = await getCommissionTaux(db);
    const commission = Math.round(montant * tauxCommission * 100) / 100;
    const montantHote = Math.round((montant - commission) * 100) / 100;

    // ── Transaction atomique ─────────────────────────────
    await db.query('BEGIN');

    // Paiement par porte-monnaie : débiter le solde du client
    if (mode_paiement === 'WALLET') {
      try {
        await wallet.debiter(client_id, montant, 'PAIEMENT', `Paiement réservation #${reservation_id}`, reservation_id, db, true);
      } catch (e) {
        await db.query('ROLLBACK');
        if (e.code === 'SOLDE_INSUFFISANT') {
          return res.status(400).json({ message: 'Solde du porte-monnaie insuffisant pour ce paiement' });
        }
        throw e;
      }
    }

    const paiement = await db.query(
      `INSERT INTO paiements
         (reservation_id, montant, mode_paiement, statut_paiement, montant_du, commission_plateforme, montant_hote)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [reservation_id, montant, mode_paiement, statutPaiement, montantDu, commission, montantHote]
    );

    await db.query(`UPDATE reservations SET statut = 'CONFIRMEE' WHERE idReservation = $1`, [reservation_id]);

    // Crédit du porte-monnaie de l'hôte (net après commission)
    await wallet.crediter(resa.hote_id, montantHote, 'GAIN_HOTE', `Gain réservation #${reservation_id}`, reservation_id, db);

    await db.query('COMMIT');

    // Notifier l'hôte
    const io = req.app.get('io');
    if (io) {
      io.to(`hote_${resa.hote_id}`).emit('reservation_confirmee', {
        message: 'Une réservation vient d\'être payée et confirmée !',
        reservation_id, montant,
      });
    }

    return res.status(201).json({
      message: partiel
        ? 'Acompte de 50% payé. Réservation confirmée. Le solde restera dû à l\'arrivée.'
        : 'Paiement effectué. Réservation confirmée automatiquement.',
      paiement: paiement.rows[0],
      details: {
        nb_nuits: nbNuits,
        prixParNuit: resa.prixparnuit,
        montant_du: montantDu,
        montant_paye: montant,
        statut_paiement: statutPaiement,
        reste_a_payer: Math.round((montantDu - montant) * 100) / 100,
        commission_plateforme: commission,
        montant_hote: montantHote,
        mode_paiement,
      },
    });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('Erreur paiement:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

// ============================================
// DÉTAIL PAIEMENT D'UNE RÉSERVATION
// ============================================
const getPaiement = async (req, res) => {
  const { reservation_id } = req.params;
  const user = req.user;

  try {
    const result = await pool.query(
      `SELECT p.*, r.dateDebut, r.dateFin, r.statut AS statut_reservation,
              a.titre AS annonce_titre, a.prixParNuit AS prix_nuit
       FROM paiements p
       JOIN reservations r ON p.reservation_id = r.idReservation
       JOIN annonces a ON r.annonce_id = a.id
       WHERE p.reservation_id = $1
       AND (r.client_id = $2 OR a.hote_id = $2)`,
      [reservation_id, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Paiement introuvable' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur récupération paiement:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { effectuerPaiement, getPaiement };