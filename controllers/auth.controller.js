const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// ============================================
// INSCRIPTION
// ============================================
const inscription = async (req, res) => {
  const { email, nom, prenom, motDePasse, typeCompte, raison_sociale } = req.body;

  if (!email || !nom || !prenom || !motDePasse || !typeCompte) {
    return res.status(400).json({ message: 'Tous les champs obligatoires doivent être remplis' });
  }

  if (!['CLIENT', 'HOTE'].includes(typeCompte)) {
    return res.status(400).json({ message: 'Rôle invalide. Choisir CLIENT ou HOTE' });
  }

  if (typeCompte === 'HOTE' && !raison_sociale) {
    return res.status(400).json({ message: 'La raison sociale est obligatoire pour un hôte' });
  }

  try {
    // Vérifier si email déjà utilisé
    const existing = await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Email déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(motDePasse, 10);

    const result = await pool.query(
      `INSERT INTO utilisateurs (email, nom, prenom, motDePasse, typeCompte, raison_sociale)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, nom, prenom, typeCompte, raison_sociale`,
      [email, nom, prenom, hashedPassword, typeCompte, raison_sociale || null]
    );

    const utilisateur = result.rows[0];

    const token = jwt.sign(
      { id: utilisateur.id, email: utilisateur.email, typeCompte: utilisateur.typecompte },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      message: 'Inscription réussie',
      token,
      utilisateur: utilisateur,
    });
  } catch (err) {
    console.error('Erreur inscription:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// CONNEXION
// ============================================
const connexion = async (req, res) => {
  const { email, motDePasse } = req.body;


  if (!email || !motDePasse) {
    return res.status(400).json({ message: 'Email et mot de passe requis' });
  }

  try {
    const result = await pool.query('SELECT * FROM utilisateurs WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const utilisateur = result.rows[0];
    const validPassword = await bcrypt.compare(motDePasse, utilisateur.motdepasse);

    if (!validPassword) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const token = jwt.sign(
      { id: utilisateur.id, email: utilisateur.email, typeCompte: utilisateur.typecompte },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    console.log("ici")

    return res.status(200).json({
      message: 'Connexion réussie',
      token,
      utilisateur: {
        id: utilisateur.id,
        email: utilisateur.email,
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        typeCompte: utilisateur.typecompte,
        raison_sociale: utilisateur.raison_sociale,
      },
    });
  } catch (err) {
    console.error('Erreur connexion:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// PROFIL (utilisateur connecté)
// ============================================
const getProfil = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, nom, prenom, typeCompte, raison_sociale, dateVerification FROM utilisateurs WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur profil:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { inscription, connexion, getProfil };
