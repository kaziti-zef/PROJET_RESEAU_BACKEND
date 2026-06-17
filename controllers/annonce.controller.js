const pool = require('../config/db');

// ============================================
// CRÉER UNE ANNONCE (Hôte)
// ============================================
const creerAnnonce = async (req, res) => {
  const { titre, description, ville, quartier, adresse, prixParNuit, capacite } = req.body;
  const hote_id = req.user.id;

  if (!titre || !ville || !prixParNuit || !capacite) {
    return res.status(400).json({ message: 'titre, ville, prixParNuit et capacite sont obligatoires' });
  }

  if (Number(prixParNuit) <= 0) {
    return res.status(400).json({ message: 'Le prix par nuit doit être supérieur à 0' });
  }

  if (Number(capacite) < 1) {
    return res.status(400).json({ message: 'La capacité doit être au moins 1' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO annonces (hote_id, titre, description, ville, quartier, adresse, prixParNuit, capacite)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [hote_id, titre, description, ville, quartier, adresse, prixParNuit, capacite]
    );

    const annonce = result.rows[0];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const imageUrl = `${process.env.UPLOAD_PATH || 'uploads/images'}/${file.filename}`;
        await pool.query(
          'INSERT INTO annonce_images (annonce_id, url) VALUES ($1, $2)',
          [annonce.id, imageUrl]
        );
      }
    }

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
    JOIN utilisateurs p ON a.hote_id = p.id
    LEFT JOIN evaluations av ON a.id = av.annonce_id
    LEFT JOIN annonce_images ai ON a.id = ai.annonce_id
    WHERE a.statut = 'DISPONIBLE'
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
    query += ` AND a.prixParNuit >= $${paramIndex++}`;
    params.push(parseFloat(prix_min));
  }
  if (prix_max) {
    query += ` AND a.prixParNuit <= $${paramIndex++}`;
    params.push(parseFloat(prix_max));
  }

  query += ` GROUP BY a.id, p.nom, p.prenom ORDER BY a.datePublication DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(parseInt(limit), parseInt(offset));

  try {
    const result = await pool.query(query, params);

    let countQuery = `SELECT COUNT(*) FROM annonces a WHERE a.statut = 'DISPONIBLE'`;
    const countParams = [];
    let countIndex = 1;
    if (ville) { countQuery += ` AND LOWER(a.ville) LIKE LOWER($${countIndex++})`; countParams.push(`%${ville}%`); }
    if (capacite) { countQuery += ` AND a.capacite >= $${countIndex++}`; countParams.push(parseInt(capacite)); }
    if (prix_min) { countQuery += ` AND a.prixParNuit >= $${countIndex++}`; countParams.push(parseFloat(prix_min)); }
    if (prix_max) { countQuery += ` AND a.prixParNuit <= $${countIndex++}`; countParams.push(parseFloat(prix_max)); }

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
       JOIN utilisateurs p ON a.hote_id = p.id
       LEFT JOIN evaluations av ON a.id = av.annonce_id
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
              COUNT(DISTINCT r.idReservation) AS nb_reservations,
              ARRAY_AGG(DISTINCT ai.url) FILTER (WHERE ai.url IS NOT NULL) AS images
       FROM annonces a
       LEFT JOIN evaluations av ON a.id = av.annonce_id
       LEFT JOIN reservations r ON a.id = r.annonce_id
       LEFT JOIN annonce_images ai ON a.id = ai.annonce_id
       WHERE a.hote_id = $1
       GROUP BY a.id
       ORDER BY a.datePublication DESC`,
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
// FIX: on récupère d'abord les valeurs actuelles pour ne pas écraser avec null
// FIX: quartier ajouté
// ============================================
const modifierAnnonce = async (req, res) => {
  const { id } = req.params;
  const hote_id = req.user.id;

  try {
    // Récupérer l'annonce actuelle
    const actuelle = await pool.query(
      'SELECT * FROM annonces WHERE id = $1 AND hote_id = $2',
      [id, hote_id]
    );

    if (actuelle.rows.length === 0) {
      return res.status(403).json({ message: 'Annonce introuvable ou non autorisé' });
    }

    const courante = actuelle.rows[0];

    // Fusionner : utiliser la nouvelle valeur si fournie, sinon garder l'ancienne
    const titre      = req.body.titre      !== undefined ? req.body.titre      : courante.titre;
    const description= req.body.description!== undefined ? req.body.description: courante.description;
    const ville      = req.body.ville      !== undefined ? req.body.ville      : courante.ville;
    const quartier   = req.body.quartier   !== undefined ? req.body.quartier   : courante.quartier;
    const adresse    = req.body.adresse    !== undefined ? req.body.adresse    : courante.adresse;
    const prixParNuit= req.body.prixParNuit!== undefined ? req.body.prixParNuit: courante.prixparnuit;
    const capacite   = req.body.capacite   !== undefined ? req.body.capacite   : courante.capacite;
    const statut     = req.body.statut     !== undefined ? req.body.statut     : courante.statut;

    await pool.query(
      `UPDATE annonces
       SET titre = $1, description = $2, ville = $3, quartier = $4,
           adresse = $5, prixParNuit = $6, capacite = $7, statut = $8
       WHERE id = $9`,
      [titre, description, ville, quartier, adresse, prixParNuit, capacite, statut, id]
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
    const check = await pool.query(
      'SELECT id FROM annonces WHERE id = $1 AND hote_id = $2',
      [id, hote_id]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ message: 'Annonce introuvable ou non autorisé' });
    }

    // RG8 : une annonce possédant des réservations futures non annulées ne peut pas être supprimée
    const futures = await pool.query(
      `SELECT COUNT(*) FROM reservations
       WHERE annonce_id = $1
       AND statut NOT IN ('ANNULEE', 'REFUSEE', 'TERMINEE')
       AND dateFin >= CURRENT_DATE`,
      [id]
    );
    if (parseInt(futures.rows[0].count) > 0) {
      return res.status(409).json({
        message: 'Impossible de supprimer : cette annonce possède des réservations en cours ou à venir',
      });
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
    const check = await pool.query(
      'SELECT id FROM annonces WHERE id = $1 AND hote_id = $2',
      [id, hote_id]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    await pool.query(
      'DELETE FROM annonce_images WHERE id = $1 AND annonce_id = $2',
      [imageId, id]
    );

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
