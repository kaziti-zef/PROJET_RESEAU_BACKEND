// ============================================================
//  services/parametres.service.js
//  Accès centralisé aux paramètres financiers de la plateforme (O3) :
//  taux de commission γ et politique de remboursement (réglés par le
//  super-admin). Repli sur des valeurs par défaut si la ligne manque.
// ============================================================

const pool = require('../config/db');

const DEFAUTS = {
  commission_pct: Number(process.env.COMMISSION_PLATEFORME || 10),
  remb_full_jours: 7,
  remb_partiel_jours: 2,
  remb_partiel_pct: 50,
};

/** Retourne les paramètres plateforme (objet typé number). */
async function getParametres(client = pool) {
  try {
    const r = await client.query('SELECT * FROM parametres_plateforme WHERE id = 1');
    if (r.rows.length === 0) return { ...DEFAUTS };
    const p = r.rows[0];
    return {
      commission_pct: Number(p.commission_pct),
      remb_full_jours: Number(p.remb_full_jours),
      remb_partiel_jours: Number(p.remb_partiel_jours),
      remb_partiel_pct: Number(p.remb_partiel_pct),
    };
  } catch {
    return { ...DEFAUTS };
  }
}

/** Taux de commission γ en fraction (ex : 0.10). */
async function getCommissionTaux(client = pool) {
  const p = await getParametres(client);
  return p.commission_pct / 100;
}

/**
 * Calcule le pourcentage de remboursement (0..1) selon le nombre de
 * jours restant avant l'arrivée et la politique en vigueur.
 *   joursAvant >= remb_full_jours     → 100%
 *   joursAvant >= remb_partiel_jours  → remb_partiel_pct%
 *   sinon                             → 0%
 */
function calculerPourcentageRemboursement(joursAvant, params) {
  if (joursAvant >= params.remb_full_jours) return 1;
  if (joursAvant >= params.remb_partiel_jours) return params.remb_partiel_pct / 100;
  return 0;
}

module.exports = {
  getParametres,
  getCommissionTaux,
  calculerPourcentageRemboursement,
  DEFAUTS,
};
