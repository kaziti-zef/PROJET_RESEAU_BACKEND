const fs = require('fs');
const pool = require('../config/db');
const { verifierCNI } = require('../services/cniVerification');

// ============================================
// DEMANDE "DEVENIR HÔTE" (Client connecté)
// Le client reste CLIENT tant que l'admin n'a pas approuvé.
// Champs requis : téléphone, photo CNI, fournisseur + identifiant
// du compte de paiement.
// La photo CNI passe d'abord par une VÉRIFICATION (C8) : si elle
// n'est pas reconnue comme pièce d'identité valide, la demande est
// rejetée immédiatement, avant tout examen par un administrateur.
// ============================================
const demanderDevenirHote = async (req, res) => {
  const client_id = req.user.id;
  const { telephone, fournisseur, identifiant } = req.body;

  if (!telephone || !fournisseur || !identifiant) {
    return res.status(400).json({
      message: 'telephone, fournisseur et identifiant (compte de paiement) sont obligatoires',
    });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'La photo de la CNI est obligatoire' });
  }

  try {
    const utilisateur = await pool.query('SELECT * FROM utilisateurs WHERE id = $1', [client_id]);
    if (utilisateur.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const courant = utilisateur.rows[0];

    if (courant.typecompte === 'HOTE') {
      return res.status(400).json({ message: 'Vous êtes déjà hôte' });
    }
    if (courant.typecompte === 'ADMINISTRATEUR') {
      return res.status(400).json({ message: 'Un administrateur ne peut pas devenir hôte' });
    }
    if (courant.statut_verification === 'EN_ATTENTE') {
      return res.status(409).json({ message: 'Une demande est déjà en attente de validation' });
    }

    // ── Vérification automatique de la CNI (C8) ──────────
    const verif = await verifierCNI(req.file.path, req.file.originalname);
    if (!verif.valide) {
      // On supprime le fichier rejeté pour ne pas encombrer le serveur
      fs.unlink(req.file.path, () => {});
      return res.status(422).json({
        message: `Pièce d'identité refusée : ${verif.raison || 'document non valide'}. Votre demande n'a pas été transmise. Réessayez avec une photo nette et lisible de votre CNI.`,
        cni_valide: false,
      });
    }

    const photoCniUrl = `${process.env.UPLOAD_PATH_CNI || 'uploads/cni'}/${req.file.filename}`;

    // Met à jour les infos du compte et passe la demande en EN_ATTENTE
    await pool.query(
      `UPDATE utilisateurs
       SET telephone = $1, photo_cni = $2, statut_verification = 'EN_ATTENTE'
       WHERE id = $3`,
      [telephone, photoCniUrl, client_id]
    );

    // Crée (ou remplace) le compte de paiement de l'utilisateur
    const compteExistant = await pool.query(
      'SELECT idComptePaiement FROM compte_paiement WHERE utilisateur_id = $1',
      [client_id]
    );
    if (compteExistant.rows.length > 0) {
      await pool.query(
        `UPDATE compte_paiement SET fournisseur = $1, identifiant = $2 WHERE utilisateur_id = $3`,
        [fournisseur, identifiant, client_id]
      );
    } else {
      await pool.query(
        `INSERT INTO compte_paiement (utilisateur_id, fournisseur, identifiant) VALUES ($1, $2, $3)`,
        [client_id, fournisseur, identifiant]
      );
    }

    return res.status(201).json({
      message: 'Pièce d\'identité vérifiée. Demande envoyée : un administrateur doit approuver votre compte avant que vous puissiez publier des annonces.',
      statut_verification: 'EN_ATTENTE',
      cni_valide: true,
    });
  } catch (err) {
    console.error('Erreur demande devenir hôte:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// STATUT DE LA DEMANDE (Client connecté)
// ============================================
const getStatutVerification = async (req, res) => {
  const client_id = req.user.id;

  try {
    const result = await pool.query(
      'SELECT typeCompte, statut_verification, telephone FROM utilisateurs WHERE id = $1',
      [client_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur statut vérification:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// LISTER LES UTILISATEURS (Admin)
// ============================================
const getUtilisateursAdmin = async (req, res) => {
  const { statut_verification, typeCompte } = req.query;

  let query = `
    SELECT u.id, u.email, u.nom, u.prenom, u.typeCompte, u.telephone, u.photo_cni,
           u.statut_verification, u.dateVerification,
           cp.fournisseur AS compte_paiement_fournisseur, cp.identifiant AS compte_paiement_identifiant
    FROM utilisateurs u
    LEFT JOIN compte_paiement cp ON cp.utilisateur_id = u.id
    WHERE 1=1
  `;
  const params = [];
  let i = 1;

  if (statut_verification) {
    query += ` AND u.statut_verification = $${i++}`;
    params.push(statut_verification);
  }
  if (typeCompte) {
    query += ` AND u.typeCompte = $${i++}`;
    params.push(typeCompte);
  }
  query += ' ORDER BY u.dateVerification DESC';

  try {
    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur liste utilisateurs admin:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// APPROUVER UNE DEMANDE "DEVENIR HÔTE" (Admin)
// ============================================
const approuverUtilisateur = async (req, res) => {
  const { id } = req.params;

  try {
    const utilisateur = await pool.query('SELECT * FROM utilisateurs WHERE id = $1', [id]);
    if (utilisateur.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const courant = utilisateur.rows[0];
    if (courant.statut_verification !== 'EN_ATTENTE') {
      return res.status(400).json({ message: 'Cette demande n\'est pas en attente de validation' });
    }

    const result = await pool.query(
      `UPDATE utilisateurs
       SET statut_verification = 'APPROUVE', typeCompte = 'HOTE'
       WHERE id = $1
       RETURNING id, email, nom, prenom, typeCompte, statut_verification`,
      [id]
    );

    return res.status(200).json({
      message: 'Compte approuvé. L\'utilisateur est désormais HOTE.',
      utilisateur: result.rows[0],
    });
  } catch (err) {
    console.error('Erreur approbation utilisateur:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// REJETER UNE DEMANDE "DEVENIR HÔTE" (Admin)
// ============================================
const rejeterUtilisateur = async (req, res) => {
  const { id } = req.params;

  try {
    const utilisateur = await pool.query('SELECT * FROM utilisateurs WHERE id = $1', [id]);
    if (utilisateur.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const courant = utilisateur.rows[0];
    if (courant.statut_verification !== 'EN_ATTENTE') {
      return res.status(400).json({ message: 'Cette demande n\'est pas en attente de validation' });
    }

    const result = await pool.query(
      `UPDATE utilisateurs
       SET statut_verification = 'REJETE'
       WHERE id = $1
       RETURNING id, email, nom, prenom, typeCompte, statut_verification`,
      [id]
    );

    return res.status(200).json({
      message: 'Demande rejetée.',
      utilisateur: result.rows[0],
    });
  } catch (err) {
    console.error('Erreur rejet utilisateur:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  demanderDevenirHote,
  getStatutVerification,
  getUtilisateursAdmin,
  approuverUtilisateur,
  rejeterUtilisateur,
};
