const pool = require('../config/db');
const { classerAnnonces } = require('../services/scoring.service');

// ============================================
// HELPERS — normalisation de listes de codes (R1 / C1)
// Accepte : tableau de codes, chaîne JSON "[...]", ou "a,b,c".
// ============================================
const parseCodes = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((c) => String(c).trim()).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.map((c) => String(c).trim()).filter(Boolean);
  } catch { /* pas du JSON, on tente le split */ }
  return s.split(',').map((c) => c.trim()).filter(Boolean);
};

// Lie une annonce à des équipements (par code), remplace les liens si demandé.
const lierEquipements = async (annonceId, codes, remplacer = false) => {
  if (remplacer) {
    await pool.query('DELETE FROM annonce_equipements WHERE annonce_id = $1', [annonceId]);
  }
  if (!codes || codes.length === 0) return;
  await pool.query(
    `INSERT INTO annonce_equipements (annonce_id, equipement_id)
     SELECT $1, e.id FROM equipements e WHERE e.code = ANY($2::varchar[])
     ON CONFLICT DO NOTHING`,
    [annonceId, codes]
  );
};

// Lie une annonce à des caractéristiques (par code), remplace les liens si demandé.
const lierCaracteristiques = async (annonceId, codes, remplacer = false) => {
  if (remplacer) {
    await pool.query('DELETE FROM annonce_caracteristiques WHERE annonce_id = $1', [annonceId]);
  }
  if (!codes || codes.length === 0) return;
  await pool.query(
    `INSERT INTO annonce_caracteristiques (annonce_id, caracteristique_id)
     SELECT $1, c.id FROM caracteristiques c WHERE c.code = ANY($2::varchar[])
     ON CONFLICT DO NOTHING`,
    [annonceId, codes]
  );
};

// Résout l'id d'un type de chambre depuis un id numérique OU un code.
const resoudreTypeId = async (type_id, type) => {
  if (type_id) return parseInt(type_id) || null;
  if (type) {
    const r = await pool.query('SELECT id FROM types_chambre WHERE code = $1', [String(type).trim()]);
    return r.rows[0] ? r.rows[0].id : null;
  }
  return null;
};

// Résout l'id d'un pays depuis un id numérique OU un code (défaut : Cameroun).
const resoudrePaysId = async (pays_id, pays) => {
  if (pays_id) return parseInt(pays_id) || null;
  if (pays) {
    const r = await pool.query('SELECT id FROM pays WHERE code = $1', [String(pays).trim().toUpperCase()]);
    if (r.rows[0]) return r.rows[0].id;
  }
  const def = await pool.query("SELECT id FROM pays WHERE code = 'CM'");
  return def.rows[0] ? def.rows[0].id : null;
};

// Valide une période [debut, fin] optionnelle. Retourne un message d'erreur ou null.
const validerPeriode = (debut, fin) => {
  if ((debut && !fin) || (!debut && fin)) {
    return 'La période de validité doit comporter une date de début ET une date de fin';
  }
  if (debut && fin && new Date(fin) < new Date(debut)) {
    return 'La date de fin de validité doit être postérieure à la date de début';
  }
  return null;
};

// Bloc SELECT commun (annonce enrichie : hôte, note, images, équipements,
// caractéristiques, type, pays + devise).
const SELECT_ANNONCE = `
  SELECT a.*, p.nom AS hote_nom, p.prenom AS hote_prenom,
         tc.code AS type_code, tc.nom AS type_nom,
         py.code AS pays_code, py.nom AS pays_nom,
         py.devise_code, py.devise_symbole,
         COALESCE(AVG(av.note), 0) AS note_moyenne,
         COUNT(DISTINCT av.id) AS nb_avis,
         ARRAY_AGG(DISTINCT ai.url)  FILTER (WHERE ai.url  IS NOT NULL) AS images,
         ARRAY_AGG(DISTINCT e.code)  FILTER (WHERE e.code  IS NOT NULL) AS equipements,
         ARRAY_AGG(DISTINCT c.code)  FILTER (WHERE c.code  IS NOT NULL) AS caracteristiques
  FROM annonces a
  JOIN utilisateurs p ON a.hote_id = p.id
  LEFT JOIN types_chambre tc ON a.type_id = tc.id
  LEFT JOIN pays py ON a.pays_id = py.id
  LEFT JOIN evaluations av ON a.id = av.annonce_id
  LEFT JOIN annonce_images ai ON a.id = ai.annonce_id
  LEFT JOIN annonce_equipements ae ON a.id = ae.annonce_id
  LEFT JOIN equipements e ON ae.equipement_id = e.id
  LEFT JOIN annonce_caracteristiques ac ON a.id = ac.annonce_id
  LEFT JOIN caracteristiques c ON ac.caracteristique_id = c.id
`;
const GROUP_ANNONCE = `GROUP BY a.id, p.id, tc.id, py.id`;

// ============================================
// CRÉER UNE ANNONCE (Hôte)
// ============================================
const creerAnnonce = async (req, res) => {
  const {
    titre, description, ville, quartier, adresse, prixParNuit, capacite,
    superficie, date_debut_validite, date_fin_validite,
    type_id, type, pays_id, pays,
  } = req.body;
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
  const erreurPeriode = validerPeriode(date_debut_validite, date_fin_validite);
  if (erreurPeriode) {
    return res.status(400).json({ message: erreurPeriode });
  }

  try {
    const typeId = await resoudreTypeId(type_id, type);
    const paysId = await resoudrePaysId(pays_id, pays);

    const result = await pool.query(
      `INSERT INTO annonces
         (hote_id, titre, description, ville, quartier, adresse, prixParNuit, capacite,
          superficie, date_debut_validite, date_fin_validite, type_id, pays_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        hote_id, titre, description, ville, quartier, adresse, prixParNuit, capacite,
        superficie || null, date_debut_validite || null, date_fin_validite || null,
        typeId, paysId,
      ]
    );

    const annonce = result.rows[0];

    // Équipements fournis (R1) + caractéristiques intrinsèques (C1)
    await lierEquipements(annonce.id, parseCodes(req.body.equipements));
    await lierCaracteristiques(annonce.id, parseCodes(req.body.caracteristiques));

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
// LISTER LES ANNONCES (Public) — avec scoring du modèle (Option A)
//
// Filtres "durs" (SQL) : ville, capacite, prix_min/prix_max, type, pays.
// Préférences "douces" (modèle) : equipements[] + caracteristiques[] désirés,
// budget (ou prix_max×nb_nuits), nb_nuits → servent à scorer/classer.
//
// tri = 'pertinence' → classement par le modèle (scoring.service)
// tri = 'populaire'  → note moyenne puis nb d'avis
// (défaut)           → date de publication décroissante
// ============================================
const getAnnonces = async (req, res) => {
  const {
    ville, capacite, prix_min, prix_max, type, pays,
    nb_nuits, budget, page = 1, limit = 10, tri,
  } = req.query;

  const prefs = [
    ...parseCodes(req.query.equipements),
    ...parseCodes(req.query.caracteristiques),
  ];

  let query = SELECT_ANNONCE + ` WHERE a.statut = 'DISPONIBLE'`;
  const params = [];
  let i = 1;

  if (ville)     { query += ` AND LOWER(a.ville) LIKE LOWER($${i++})`; params.push(`%${ville}%`); }
  if (capacite)  { query += ` AND a.capacite >= $${i++}`;            params.push(parseInt(capacite)); }
  if (prix_min)  { query += ` AND a.prixParNuit >= $${i++}`;         params.push(parseFloat(prix_min)); }
  if (prix_max)  { query += ` AND a.prixParNuit <= $${i++}`;         params.push(parseFloat(prix_max)); }
  if (type)      { query += ` AND tc.code = $${i++}`;                params.push(String(type).trim()); }
  if (pays)      { query += ` AND py.code = $${i++}`;                params.push(String(pays).trim().toUpperCase()); }

  // On ramène les candidats (plafonnés) puis on trie/scorera en JS.
  query += ` ${GROUP_ANNONCE} LIMIT 500`;

  try {
    const result = await pool.query(query, params);
    let annonces = result.rows.map((a) => ({
      ...a,
      note_moyenne: Number(a.note_moyenne) || 0,
      nb_avis: Number(a.nb_avis) || 0,
    }));

    // ── Application du modèle / tri ──────────────────────
    const nbNuits = Math.max(1, parseInt(nb_nuits) || 1);
    if (tri === 'pertinence') {
      const budgetTotal = budget
        ? parseFloat(budget)
        : (prix_max ? parseFloat(prix_max) * nbNuits : Infinity);
      annonces = classerAnnonces(annonces, { nbNuits, budget: budgetTotal, prefs });
    } else if (tri === 'populaire') {
      annonces.sort((x, y) => y.note_moyenne - x.note_moyenne || y.nb_avis - x.nb_avis);
    } else {
      annonces.sort((x, y) => new Date(y.datepublication) - new Date(x.datepublication));
    }

    // ── Pagination (en mémoire, jeu déjà plafonné) ───────
    const total = annonces.length;
    const pageNum = parseInt(page) || 1;
    const lim = parseInt(limit) || 10;
    const start = (pageNum - 1) * lim;
    const pageItems = annonces.slice(start, start + lim);

    return res.status(200).json({
      annonces: pageItems,
      pagination: {
        total,
        page: pageNum,
        limit: lim,
        total_pages: Math.ceil(total / lim),
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
      `${SELECT_ANNONCE} WHERE a.id = $1 ${GROUP_ANNONCE}`,
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
              tc.code AS type_code, tc.nom AS type_nom,
              py.code AS pays_code, py.nom AS pays_nom,
              py.devise_code, py.devise_symbole,
              COALESCE(AVG(av.note), 0) AS note_moyenne,
              COUNT(DISTINCT av.id) AS nb_avis,
              COUNT(DISTINCT r.idReservation) AS nb_reservations,
              ARRAY_AGG(DISTINCT ai.url) FILTER (WHERE ai.url IS NOT NULL) AS images,
              ARRAY_AGG(DISTINCT e.code) FILTER (WHERE e.code IS NOT NULL) AS equipements,
              ARRAY_AGG(DISTINCT c.code) FILTER (WHERE c.code IS NOT NULL) AS caracteristiques
       FROM annonces a
       LEFT JOIN types_chambre tc ON a.type_id = tc.id
       LEFT JOIN pays py ON a.pays_id = py.id
       LEFT JOIN evaluations av ON a.id = av.annonce_id
       LEFT JOIN reservations r ON a.id = r.annonce_id
       LEFT JOIN annonce_images ai ON a.id = ai.annonce_id
       LEFT JOIN annonce_equipements ae ON a.id = ae.annonce_id
       LEFT JOIN equipements e ON ae.equipement_id = e.id
       LEFT JOIN annonce_caracteristiques ac ON a.id = ac.annonce_id
       LEFT JOIN caracteristiques c ON ac.caracteristique_id = c.id
       WHERE a.hote_id = $1
       GROUP BY a.id, tc.id, py.id
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
// VILLES LES PLUS POPULAIRES (Public)
// Conservé pour compatibilité (sections de l'accueil).
// ============================================
const getVillesPopulaires = async (req, res) => {
  const { limit = 10 } = req.query;

  try {
    const result = await pool.query(
      `SELECT a.ville, COUNT(DISTINCT a.hote_id) AS nb_hotes, COUNT(a.id) AS nb_annonces
       FROM annonces a
       GROUP BY a.ville
       ORDER BY nb_hotes DESC, nb_annonces DESC
       LIMIT $1`,
      [parseInt(limit)]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erreur villes populaires:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ============================================
// MODIFIER UNE ANNONCE (Hôte)
// ============================================
const modifierAnnonce = async (req, res) => {
  const { id } = req.params;
  const hote_id = req.user.id;

  try {
    const actuelle = await pool.query(
      'SELECT * FROM annonces WHERE id = $1 AND hote_id = $2',
      [id, hote_id]
    );

    if (actuelle.rows.length === 0) {
      return res.status(403).json({ message: 'Annonce introuvable ou non autorisé' });
    }

    const courante = actuelle.rows[0];

    const titre      = req.body.titre      !== undefined ? req.body.titre      : courante.titre;
    const description= req.body.description!== undefined ? req.body.description: courante.description;
    const ville      = req.body.ville      !== undefined ? req.body.ville      : courante.ville;
    const quartier   = req.body.quartier   !== undefined ? req.body.quartier   : courante.quartier;
    const adresse    = req.body.adresse    !== undefined ? req.body.adresse    : courante.adresse;
    const prixParNuit= req.body.prixParNuit!== undefined ? req.body.prixParNuit: courante.prixparnuit;
    const capacite   = req.body.capacite   !== undefined ? req.body.capacite   : courante.capacite;
    const statut     = req.body.statut     !== undefined ? req.body.statut     : courante.statut;
    const superficie = req.body.superficie !== undefined ? (req.body.superficie || null) : courante.superficie;
    const dateDebutValidite = req.body.date_debut_validite !== undefined
      ? (req.body.date_debut_validite || null) : courante.date_debut_validite;
    const dateFinValidite = req.body.date_fin_validite !== undefined
      ? (req.body.date_fin_validite || null) : courante.date_fin_validite;

    // Type / pays : on ne touche que si fourni
    const typeId = (req.body.type_id !== undefined || req.body.type !== undefined)
      ? await resoudreTypeId(req.body.type_id, req.body.type)
      : courante.type_id;
    const paysId = (req.body.pays_id !== undefined || req.body.pays !== undefined)
      ? await resoudrePaysId(req.body.pays_id, req.body.pays)
      : courante.pays_id;

    const erreurPeriode = validerPeriode(dateDebutValidite, dateFinValidite);
    if (erreurPeriode) {
      return res.status(400).json({ message: erreurPeriode });
    }

    await pool.query(
      `UPDATE annonces
       SET titre = $1, description = $2, ville = $3, quartier = $4,
           adresse = $5, prixParNuit = $6, capacite = $7, statut = $8,
           superficie = $9, date_debut_validite = $10, date_fin_validite = $11,
           type_id = $12, pays_id = $13
       WHERE id = $14`,
      [titre, description, ville, quartier, adresse, prixParNuit, capacite, statut,
       superficie, dateDebutValidite, dateFinValidite, typeId, paysId, id]
    );

    // Équipements (R1) et caractéristiques (C1) : mis à jour seulement si fournis
    if (req.body.equipements !== undefined) {
      await lierEquipements(id, parseCodes(req.body.equipements), true);
    }
    if (req.body.caracteristiques !== undefined) {
      await lierCaracteristiques(id, parseCodes(req.body.caracteristiques), true);
    }

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
// HELPER — annonce enrichie par id (images, équipements, caractéristiques, type, pays)
// ============================================
const getAnnonceAvecImages = async (id) => {
  const result = await pool.query(
    `SELECT a.*,
            tc.code AS type_code, tc.nom AS type_nom,
            py.code AS pays_code, py.nom AS pays_nom,
            py.devise_code, py.devise_symbole,
            ARRAY_AGG(DISTINCT ai.url) FILTER (WHERE ai.url IS NOT NULL) AS images,
            ARRAY_AGG(DISTINCT e.code) FILTER (WHERE e.code IS NOT NULL) AS equipements,
            ARRAY_AGG(DISTINCT c.code) FILTER (WHERE c.code IS NOT NULL) AS caracteristiques
     FROM annonces a
     LEFT JOIN types_chambre tc ON a.type_id = tc.id
     LEFT JOIN pays py ON a.pays_id = py.id
     LEFT JOIN annonce_images ai ON a.id = ai.annonce_id
     LEFT JOIN annonce_equipements ae ON a.id = ae.annonce_id
     LEFT JOIN equipements e ON ae.equipement_id = e.id
     LEFT JOIN annonce_caracteristiques ac ON a.id = ac.annonce_id
     LEFT JOIN caracteristiques c ON ac.caracteristique_id = c.id
     WHERE a.id = $1
     GROUP BY a.id, tc.id, py.id`,
    [id]
  );
  return result.rows[0];
};

module.exports = {
  creerAnnonce,
  getAnnonces,
  getAnnonceById,
  getMesAnnonces,
  getVillesPopulaires,
  modifierAnnonce,
  supprimerAnnonce,
  supprimerImage,
};
