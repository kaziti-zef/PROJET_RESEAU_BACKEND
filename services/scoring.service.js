// ============================================================
//  services/scoring.service.js
//  IMPLÉMENTATION DU MODÈLE MATHÉMATIQUE (PLNE) — Option A
//  « Moteur de compatibilité locataire ↔ chambre »
//
//  Le cahier de charge définit un Programme Linéaire en Nombres
//  Entiers (PLNE, §3.4) qui MAXIMISE le surplus social global :
//
//    max  Σ_c Σ_l  [ γ·P_cl
//                   + α1·(B_l − P_cl)
//                   + α2·N_c
//                   + α3·Σ_k Pref_lk·Carac_ck
//                   + β1·((1−γ)·P_cl − Δ_l·Cout_c)
//                   + β2·R_l ] · x_cl
//                 + Σ_c Σ_{l<f} S_lf · z_{c,l,f}
//
//  CHOIX D'IMPLÉMENTATION (validé) :
//  --------------------------------------------------------------
//  • Chambres EXCLUSIVES (1 réservation = toute la chambre) ⇒ les
//    termes de cohabitation (z_{c,l,f}, synergie S_lf) valent 0 :
//    on les conserve dans la formulation du mémoire mais ils
//    n'interviennent pas ici.
//  • On n'optimise pas globalement côté admin. À CHAQUE RECHERCHE
//    d'un client l, on évalue le crochet U_cl pour chaque chambre
//    candidate c, puis on TRIE par score décroissant. C'est ainsi
//    que « l'application repose sur le modèle » : le classement et
//    les recommandations proviennent directement de la fonction
//    objectif.
//
//  Chaque composante monétaire est normalisée par le budget B_l
//  afin que les poids (α, β) soient comparables entre des grandeurs
//  d'échelles différentes (FCFA vs note 0–5 vs nb d'équipements).
//  C'est une instanciation normalisée de (3.1), terme à terme.
//
//  COMPLEXITÉ (Option A) :
//  --------------------------------------------------------------
//  • scoreAnnonce(...)   : O(|K|)  où |K| = nb de critères désirés
//                          (produit scalaire Pref_lk · Carac_ck).
//  • classerAnnonces(...) : O(|C|·|K|) pour scorer toutes les
//                          chambres candidates, + O(|C|·log|C|) pour
//                          le tri ⇒ O(|C|·(|K| + log|C|)).
//    => POLYNOMIAL (quasi-linéaire en nombre de chambres).
//  À titre de comparaison, la résolution EXACTE du PLNE (branch &
//  bound) est NP-difficile : O(2^(|C|·|L|)) dans le pire cas.
// ============================================================

// ── Poids par défaut (paramétrables via .env) ───────────────
// Les termes "client" (budget, note, correspondance des critères)
// dominent volontairement les termes "plateforme/hôte" pour une
// recommandation orientée utilisateur ; les seconds restent dans
// la formule (fidélité au modèle) avec un poids faible.
const POIDS = {
  alpha1: num(process.env.SCORING_ALPHA1, 1.0), // marge budgétaire (B_l − P_cl)
  alpha2: num(process.env.SCORING_ALPHA2, 1.0), // note de la chambre N_c
  alpha3: num(process.env.SCORING_ALPHA3, 2.5), // correspondance des critères (cœur de la pertinence)
  beta1:  num(process.env.SCORING_BETA1,  0.3), // marge nette de l'hôte
  beta2:  num(process.env.SCORING_BETA2,  0.1), // réputation du locataire R_l (≈ constante par recherche)
};

// Taux de commission γ (aussi utilisé par la finance). 10 % par défaut.
const GAMMA = num(process.env.COMMISSION_PLATEFORME, 10) / 100;

// Coût marginal de maintenance Cout_c, approximé en fraction du
// prix/nuit (on ne le stocke pas en base). 20 % par défaut.
const COUT_RATIO = num(process.env.SCORING_COUT_RATIO, 0.2);

// Réputation par défaut d'un locataire sans historique (sur 5).
const REPUTATION_DEFAUT = num(process.env.SCORING_REPUTATION_DEFAUT, 4);

function num(v, def) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
}
function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Calcule le score d'une chambre `annonce` pour un client défini par `criteres`.
 *
 * @param {Object} annonce  Annonce enrichie (prixparnuit, note_moyenne,
 *                          equipements[], caracteristiques[]).
 * @param {Object} criteres Critères du locataire l :
 *   - nbNuits   {number}  Δ_l : durée du séjour (>= 1)
 *   - budget    {number}  B_l : budget total du séjour (FCFA) ; Infinity si non fourni
 *   - prefs     {string[]}     codes des critères désirés (équipements + caractéristiques)
 *   - reputation{number}  R_l sur 5 (optionnel)
 * @returns {{score:number, prixTotal:number, details:Object}}
 */
function scoreAnnonce(annonce, criteres) {
  const nbNuits = Math.max(1, Number(criteres.nbNuits) || 1);
  const prixNuit = Number(annonce.prixparnuit ?? annonce.prix ?? 0);
  const note = Number(annonce.note_moyenne ?? 0);          // N_c ∈ [0,5]
  const reputation = Number(criteres.reputation ?? REPUTATION_DEFAUT); // R_l

  // P_cl : prix total proposé pour le séjour
  const prixTotal = prixNuit * nbNuits;

  // B_l : budget total (Infinity si non précisé → marge budgétaire = 1)
  const budget = Number.isFinite(criteres.budget) && criteres.budget > 0
    ? criteres.budget
    : Infinity;

  // Cout_c : coût marginal de maintenance par jour
  const coutJour = prixNuit * COUT_RATIO;

  // ── Composantes normalisées dans [0,1] ────────────────────

  // α1 · (B_l − P_cl) : marge budgétaire (1 = très en-dessous du budget)
  const sBudget = Number.isFinite(budget)
    ? clamp01((budget - prixTotal) / budget)
    : 1;

  // α2 · N_c : qualité (note moyenne)
  const sNote = clamp01(note / 5);

  // α3 · Σ_k Pref_lk · Carac_ck : taux de critères désirés effectivement présents
  const sCriteres = matchCriteres(annonce, criteres.prefs);

  // β1 · ((1−γ)·P_cl − Δ_l·Cout_c) : marge nette de l'hôte, normalisée par B_l
  const margeHote = (1 - GAMMA) * prixTotal - nbNuits * coutJour;
  const baseNorm = Number.isFinite(budget) ? budget : (prixTotal || 1);
  const sHote = clamp01(margeHote / baseNorm);

  // β2 · R_l : réputation du locataire (≈ constante d'une chambre à l'autre)
  const sReput = clamp01(reputation / 5);

  const score =
    POIDS.alpha1 * sBudget +
    POIDS.alpha2 * sNote +
    POIDS.alpha3 * sCriteres +
    POIDS.beta1  * sHote +
    POIDS.beta2  * sReput;

  return {
    score: Math.round(score * 10000) / 10000,
    prixTotal,
    details: {
      marge_budgetaire: round(sBudget),
      note: round(sNote),
      correspondance_criteres: round(sCriteres),
      marge_hote: round(sHote),
      reputation: round(sReput),
      gamma: GAMMA,
      poids: POIDS,
    },
  };
}

/**
 * Σ_k Pref_lk · Carac_ck normalisé : fraction des critères désirés
 * (équipements + caractéristiques) effectivement présents dans la chambre.
 * Pref_lk = 1 si le critère k est demandé (poids uniforme), 0 sinon.
 * Renvoie 0.5 (neutre) si le client n'a exprimé aucun critère.
 */
function matchCriteres(annonce, prefs) {
  const desires = (prefs || []).map((c) => String(c).trim().toLowerCase()).filter(Boolean);
  if (desires.length === 0) return 0.5;

  const presents = new Set(
    []
      .concat(annonce.equipements || [])
      .concat(annonce.caracteristiques || [])
      .map((c) => String(c).trim().toLowerCase())
  );

  let trouves = 0;
  for (const k of desires) if (presents.has(k)) trouves++;
  return trouves / desires.length;
}

/**
 * Score + tri décroissant d'une liste de chambres candidates.
 * Chaque annonce reçoit un champ `score` (et `prixTotalSejour`).
 * Complexité : O(|C|·(|K| + log|C|)).
 */
function classerAnnonces(annonces, criteres) {
  const scorees = annonces.map((a) => {
    const { score, prixTotal, details } = scoreAnnonce(a, criteres);
    return { ...a, score, prixTotalSejour: prixTotal, score_details: details };
  });
  scorees.sort((x, y) => y.score - x.score);
  return scorees;
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}

module.exports = {
  scoreAnnonce,
  classerAnnonces,
  matchCriteres,
  GAMMA,
  POIDS,
};
