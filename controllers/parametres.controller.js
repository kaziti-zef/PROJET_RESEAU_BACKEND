const pool = require('../config/db');
const { getParametres } = require('../services/parametres.service');

// ============================================
// LIRE LES PARAMÈTRES PLATEFORME (Admin) — O3
// ============================================
const lireParametres = async (req, res) => {
  try {
    const p = await getParametres();
    return res.status(200).json(p);
  } catch (err) {
    console.error('Erreur lecture paramètres:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// METTRE À JOUR LES PARAMÈTRES (Super-admin) — O3
// Commission + politique de remboursement.
// ============================================
const majParametres = async (req, res) => {
  const { commission_pct, remb_full_jours, remb_partiel_jours, remb_partiel_pct } = req.body;

  // Validations
  if (commission_pct != null && (Number(commission_pct) < 0 || Number(commission_pct) > 100)) {
    return res.status(400).json({ message: 'La commission doit être comprise entre 0 et 100 %' });
  }
  if (remb_partiel_pct != null && (Number(remb_partiel_pct) < 0 || Number(remb_partiel_pct) > 100)) {
    return res.status(400).json({ message: 'Le pourcentage de remboursement partiel doit être entre 0 et 100 %' });
  }
  if (remb_full_jours != null && remb_partiel_jours != null && Number(remb_partiel_jours) > Number(remb_full_jours)) {
    return res.status(400).json({ message: 'Le seuil "partiel" (jours) ne peut pas dépasser le seuil "remboursement total"' });
  }

  try {
    const actuel = await getParametres();
    const next = {
      commission_pct:     commission_pct     != null ? Number(commission_pct)     : actuel.commission_pct,
      remb_full_jours:    remb_full_jours    != null ? Number(remb_full_jours)    : actuel.remb_full_jours,
      remb_partiel_jours: remb_partiel_jours != null ? Number(remb_partiel_jours) : actuel.remb_partiel_jours,
      remb_partiel_pct:   remb_partiel_pct   != null ? Number(remb_partiel_pct)   : actuel.remb_partiel_pct,
    };

    await pool.query(
      `INSERT INTO parametres_plateforme (id, commission_pct, remb_full_jours, remb_partiel_jours, remb_partiel_pct)
       VALUES (1, $1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         commission_pct = EXCLUDED.commission_pct,
         remb_full_jours = EXCLUDED.remb_full_jours,
         remb_partiel_jours = EXCLUDED.remb_partiel_jours,
         remb_partiel_pct = EXCLUDED.remb_partiel_pct`,
      [next.commission_pct, next.remb_full_jours, next.remb_partiel_jours, next.remb_partiel_pct]
    );

    return res.status(200).json({ message: 'Paramètres mis à jour', parametres: next });
  } catch (err) {
    console.error('Erreur mise à jour paramètres:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// SYNTHÈSE FINANCIÈRE DE LA PLATEFORME (Super-admin) — O4
// Commission brute, part remboursée, net plateforme, volume.
// ============================================
const getFinancePlateforme = async (req, res) => {
  try {
    const paie = await pool.query(
      `SELECT
         COALESCE(SUM(montant), 0)                AS volume_brut,
         COALESCE(SUM(commission_plateforme), 0)  AS commission_brute,
         COALESCE(SUM(montant_hote), 0)           AS reverse_hotes,
         COUNT(*)                                 AS nb_paiements
       FROM paiements`
    );
    const remb = await pool.query(
      `SELECT
         COALESCE(SUM(montant_total), 0)    AS total_rembourse,
         COALESCE(SUM(part_plateforme), 0)  AS commission_remboursee,
         COALESCE(SUM(part_hote), 0)        AS hote_repris,
         COUNT(*)                           AS nb_remboursements
       FROM remboursements`
    );

    const p = paie.rows[0];
    const r = remb.rows[0];
    const commissionNette = Number(p.commission_brute) - Number(r.commission_remboursee);

    return res.status(200).json({
      volume_brut: Number(p.volume_brut),
      commission_brute: Number(p.commission_brute),
      commission_remboursee: Number(r.commission_remboursee),
      commission_nette: Math.round(commissionNette * 100) / 100,
      reverse_hotes: Number(p.reverse_hotes),
      total_rembourse: Number(r.total_rembourse),
      nb_paiements: Number(p.nb_paiements),
      nb_remboursements: Number(r.nb_remboursements),
    });
  } catch (err) {
    console.error('Erreur finance plateforme:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { lireParametres, majParametres, getFinancePlateforme };
