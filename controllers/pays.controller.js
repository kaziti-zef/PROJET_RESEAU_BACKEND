const pool = require('../config/db');

// ============================================
// LISTER LES PAYS (Public) — P1
// Fournit la devise de chaque pays (pour l'affichage des prix).
// ============================================
const getPays = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, code, nom, devise_code, devise_symbole, indicatif FROM pays ORDER BY nom ASC'
    );
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur liste pays:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// LISTER LES VILLES D'UN PAYS (Public) — P1
// Param : pays_id (query) OU code (query, ex ?code=CM)
// Sans paramètre : toutes les villes (avec leur pays).
// ============================================
const getVilles = async (req, res) => {
  const { pays_id, code } = req.query;

  try {
    let query = `
      SELECT v.id, v.nom, v.pays_id, p.code AS pays_code, p.nom AS pays_nom
      FROM villes v
      JOIN pays p ON v.pays_id = p.id
    `;
    const params = [];
    if (pays_id) {
      params.push(parseInt(pays_id));
      query += ` WHERE v.pays_id = $${params.length}`;
    } else if (code) {
      params.push(String(code).toUpperCase());
      query += ` WHERE p.code = $${params.length}`;
    }
    query += ' ORDER BY v.nom ASC';

    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur liste villes:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getPays, getVilles };
