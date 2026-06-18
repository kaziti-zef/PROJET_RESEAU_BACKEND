const pool = require('../config/db');

/**
 * Middleware de vérification super-admin.
 * À utiliser après authMiddleware. Vérifie en base (et non via le JWT,
 * qui ne porte pas ce champ) que l'utilisateur est bien est_super_admin = TRUE.
 */
const superAdminMiddleware = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Non authentifié' });
  }

  try {
    const result = await pool.query(
      'SELECT est_super_admin FROM utilisateurs WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0 || result.rows[0].est_super_admin !== true) {
      return res.status(403).json({ message: 'Accès réservé au super-administrateur' });
    }

    next();
  } catch (err) {
    console.error('Erreur vérification super-admin:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = superAdminMiddleware;