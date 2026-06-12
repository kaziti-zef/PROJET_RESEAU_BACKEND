const pool = require('../config/db');
const path = require('path');

// ============================================
// CRÉER UNE ANNONCE (Hôte)
// ============================================
const creerAnnonce = async (req, res) => {
  const { titre, description, ville, quartier, adresse, prix, capacite } = req.body;
  const hote_id = req.user.id;

  if (!titre || !ville || !prix || !capacite) {
    return res.status(400).json({ message: 'titre, ville, prix et capacite sont obligatoires' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO annonces (hote_id, titre, description, ville, quartier, adresse, prix, capacite)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [hote_id, titre, description, ville, quartier, adresse, prix, capacite]
    );

    const annonce = result.rows[0];

    // Traiter les images uploadées
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const imageUrl = `${process.env.UPLOAD_PATH || 'uploads/images'}/${file.filename}`;
        await pool.query(
          'INSERT INTO annonce_images (annonce_id, url) VALUES ($1, $2)',
          [annonce.id, imageUrl]
        );
      }
    }

    // Récupérer l'annonce avec ses images
    const annonceComplete = await getAnnonceAvecImages(annonce.id);

    return res.status(201).json({
      message: 'Annonce créée avec succès',
      annonce: annonceComplete,
    });
  } catch (err) {
    console.error('Erreur création annonce:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// LISTER TOUTES LES ANNONCES (Public)
// ============================================
const getAnnonces = async (req, res) => {
  const { ville, capacite, prix_min, prix_max, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT a.*, p.nom AS hote_nom, p.prenom AS hote_prenom,
           COALESCE(AVG(av.note), 0) AS note_moyenne,
           COUNT(DISTINCT av.id) AS nb_avis,
           ARRAY_AGG(DISTINCT ai.url) FILTER (WHERE ai.url IS NOT NULL) AS images
    FROM annonces a
    JOIN personnes p ON a.hote_id = p.id
    LEFT JOIN avis av ON a.id = av.annonce_id
    LEFT JOIN annonce_images ai ON a.id = ai.annonce_id
    WHERE a.disponible = true
  `;

  const params = [];
  let paramIndex = 1;

  if (ville) {
    query += ` AND LOWER(a.ville) LIKE LOWER($${paramIndex++})`;
    params.push(`%${ville}%`);
  }
  if (capacite) {
    query += ` AND a.capacite >= $${paramIndex++}`;
    params.push(parseInt(capacite));
  }
  if (prix_min) {
    query += ` AND a.prix >= $${paramIndex++}`;
    params.push(parseFloat(prix_min));
  }
  if (prix_max) {
    query += ` AND a.prix <= $${paramIndex++}`;
    params.push(parseFloat(prix_max));
  }

  query += ` GROUP BY a.id, p.nom, p.prenom ORDER BY a.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(parseInt(limit), parseInt(offset));

  try {
    const result = await pool.query(query, params);

    // Compter le total
    let countQuery = `SELECT COUNT(*) FROM annonces a WHERE a.disponible = true`;
    const countParams = [];
    let countIndex = 1;
    if (ville) { countQuery += ` AND LOWER(a.ville) LIKE LOWER($${countIndex++})`; countParams.push(`%${ville}%`); }
    if (capacite) { countQuery += ` AND a.capacite >= $${countIndex++}`; countParams.push(parseInt(capacite)); }
    if (prix_min) { countQuery += ` AND a.prix >= $${countIndex++}`; countParams.push(parseFloat(prix_min)); }
    if (prix_max) { countQuery += ` AND a.prix <= $${countIndex++}`; countParams.push(parseFloat(prix_max)); }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    return res.status(200).json({
      annonces: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Erreur liste annonces:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// DÉTAIL D'UNE ANNONCE (Public)
// ============================================
const getAnnonceById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT a.*, p.nom AS hote_nom, p.prenom AS hote_prenom, p.raison_sociale,
              COALESCE(AVG(av.note), 0) AS note_moyenne,
              COUNT(DISTINCT av.id) AS nb_avis,
              ARRAY_AGG(DISTINCT ai.url) FILTER (WHERE ai.url IS NOT NULL) AS images
       FROM annonces a
       JOIN personnes p ON a.hote_id = p.id
       LEFT JOIN avis av ON a.id = av.annonce_id
       LEFT JOIN annonce_images ai ON a.id = ai.annonce_id
       WHERE a.id = $1
       GROUP BY a.id, p.nom, p.prenom, p.raison_sociale`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Annonce introuvable' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur détail annonce:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// MES ANNONCES (Hôte)
// ============================================
const getMesAnnonces = async (req, res) => {
  const hote_id = req.user.id;

  try {
    const result = await pool.query(
      `SELECT a.*,
              COALESCE(AVG(av.note), 0) AS note_moyenne,
              COUNT(DISTINCT av.id) AS nb_avis,
              COUNT(DISTINCT r.id) AS nb_reservations,
              ARRAY_AGG(DISTINCT ai.url) FILTER (WHERE ai.url IS NOT NULL) AS images
       FROM annonces a
       LEFT JOIN avis av ON a.id = av.annonce_id
       LEFT JOIN reservations r ON a.id = r.annonce_id
       LEFT JOIN annonce_images ai ON a.id = ai.annonce_id
       WHERE a.hote_id = $1
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
      [hote_id]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur mes annonces:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// MODIFIER UNE ANNONCE (Hôte)
// ============================================
const modifierAnnonce = async (req, res) => {
  const { id } = req.params;
  const hote_id = req.user.id;
  const { titre, description, ville, quartier, adresse, prix, capacite, disponible } = req.body;

  try {
    // Vérifier que l'annonce appartient à cet hôte
    const check = await pool.query('SELECT id FROM annonces WHERE id = $1 AND hote_id = $2', [id, hote_id]);
    if (check.rows.length === 0) {
      return res.status(403).json({ message: 'Annonce introuvable ou non autorisé' });
    }

    const result = await pool.query(
      `UPDATE annonces
       SET titre = COALESCE($1, titre),
           description = COALESCE($2, description),
           ville = COALESCE($3, ville),
           quartier = COALESCE($4, quartier),
           adresse = COALESCE($5, adresse),
           prix = COALESCE($6, prix),
           capacite = COALESCE($7, capacite),
           disponible = COALESCE($8, disponible),
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [titre, description, ville, quartier, adresse, prix, capacite, disponible, id]
    );

    // Ajouter nouvelles images si fournies
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const imageUrl = `${process.env.UPLOAD_PATH || 'uploads/images'}/${file.filename}`;
        await pool.query(
          'INSERT INTO annonce_images (annonce_id, url) VALUES ($1, $2)',
          [id, imageUrl]
        );
      }
    }

    const annonceComplete = await getAnnonceAvecImages(id);

    return res.status(200).json({
      message: 'Annonce mise à jour',
      annonce: annonceComplete,
    });
  } catch (err) {
    console.error('Erreur modification annonce:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// SUPPRIMER UNE ANNONCE (Hôte)
// ============================================
const supprimerAnnonce = async (req, res) => {
  const { id } = req.params;
  const hote_id = req.user.id;

  try {
    const check = await pool.query('SELECT id FROM annonces WHERE id = $1 AND hote_id = $2', [id, hote_id]);
    if (check.rows.length === 0) {
      return res.status(403).json({ message: 'Annonce introuvable ou non autorisé' });
    }

    await pool.query('DELETE FROM annonces WHERE id = $1', [id]);

    return res.status(200).json({ message: 'Annonce supprimée avec succès' });
  } catch (err) {
    console.error('Erreur suppression annonce:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// SUPPRIMER UNE IMAGE (Hôte)
// ============================================
const supprimerImage = async (req, res) => {
  const { id, imageId } = req.params;
  const hote_id = req.user.id;

  try {
    const check = await pool.query('SELECT id FROM annonces WHERE id = $1 AND hote_id = $2', [id, hote_id]);
    if (check.rows.length === 0) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    await pool.query('DELETE FROM annonce_images WHERE id = $1 AND annonce_id = $2', [imageId, id]);

    return res.status(200).json({ message: 'Image supprimée' });
  } catch (err) {
    console.error('Erreur suppression image:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// HELPER
// ============================================
const getAnnonceAvecImages = async (id) => {
  const result = await pool.query(
    `SELECT a.*, ARRAY_AGG(ai.url) FILTER (WHERE ai.url IS NOT NULL) AS images
     FROM annonces a
     LEFT JOIN annonce_images ai ON a.id = ai.annonce_id
     WHERE a.id = $1
     GROUP BY a.id`,
    [id]
  );
  return result.rows[0];
};

module.exports = {
  creerAnnonce,
  getAnnonces,
  getAnnonceById,
  getMesAnnonces,
  modifierAnnonce,
  supprimerAnnonce,
  supprimerImage,
};
