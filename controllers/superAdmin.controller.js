const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// ============================================
// CRÉER UN ADMINISTRATEUR (Super-admin uniquement)
// ============================================
const creerAdmin = async (req, res) => {
  const { email, nom, prenom, motDePasse } = req.body;

  if (!email || !nom || !prenom || !motDePasse) {
    return res.status(400).json({ message: 'email, nom, prenom et motDePasse sont obligatoires' });
  }

  if (String(motDePasse).length < 6) {
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères' });
  }

  try {
    const existing = await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Email déjà utilisé' });
    }

    const motDePasseHash = await bcrypt.hash(motDePasse, 10);

    const result = await pool.query(
      `INSERT INTO utilisateurs (email, nom, prenom, motDePasse, typeCompte, statut_verification, est_super_admin)
       VALUES ($1, $2, $3, $4, 'ADMINISTRATEUR', 'APPROUVE', FALSE)
       RETURNING id, email, nom, prenom, typeCompte`,
      [email, nom, prenom, motDePasseHash]
    );

    return res.status(201).json({
      message: 'Administrateur créé avec succès',
      utilisateur: result.rows[0],
    });
  } catch (err) {
    console.error('Erreur création administrateur:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// LISTER LES ADMINISTRATEURS (Super-admin uniquement)
// ============================================
const getAdmins = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, nom, prenom, est_super_admin, dateVerification
       FROM utilisateurs WHERE typeCompte = 'ADMINISTRATEUR'
       ORDER BY dateVerification ASC`
    );
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur liste administrateurs:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { creerAdmin, getAdmins };