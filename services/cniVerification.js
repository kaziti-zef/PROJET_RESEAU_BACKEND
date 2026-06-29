// ============================================================
//  services/cniVerification.js
//  Vérification de pièce d'identité (CNI) — POINT D'INTÉGRATION (C8)
//
//  ⚠️ IMPLÉMENTATION SIMULÉE. L'API réelle n'est pas encore
//  disponible. Tout est isolé ici : le jour où l'API est fournie,
//  il suffit de remplacer le corps de `verifierCNI()` par l'appel
//  HTTP réel (puis renvoyer le même format de retour). Aucun autre
//  fichier n'a besoin d'être modifié.
//
//  Contrat de retour :
//    {
//      valide: boolean,
//      raison?: string,                 // si invalide
//      champs_extraits?: {              // si valide
//        numero_cni, nom, prenom, date_naissance, date_expiration
//      }
//    }
//
//  Modes (env CNI_SIMULATION) :
//    - 'always_valid'   : accepte toujours
//    - 'always_invalid' : refuse toujours
//    - 'heuristique'    : (défaut) refuse si l'image est trop petite
//                         ou si le nom de fichier suggère un faux
//                         (invalid/faux/fake/test/blank) ; sinon accepte.
// ============================================================

const fs = require('fs');

const MODE = process.env.CNI_SIMULATION || 'heuristique';
const TAILLE_MIN = Number(process.env.CNI_TAILLE_MIN_OCTETS || 10 * 1024); // 10 Ko
const MOTS_SUSPECTS = ['invalid', 'faux', 'fake', 'test', 'blank', 'vide'];

// Génère des champs extraits factices, déterministes à partir du nom de fichier.
function champsFactices(originalName) {
  const seed = String(originalName || 'cni')
    .split('')
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 1_000_000, 7);
  const numero = `CM${String(100000 + (seed % 900000))}`;
  const annee = 1970 + (seed % 35);
  return {
    numero_cni: numero,
    nom: 'NOM_DETECTE',
    prenom: 'Prenom_detecte',
    date_naissance: `${annee}-0${1 + (seed % 9)}-1${seed % 9}`,
    date_expiration: `${annee + 40}-12-31`,
  };
}

/**
 * Vérifie une photo de CNI.
 * @param {string} filePath      Chemin du fichier uploadé sur le disque.
 * @param {string} originalName  Nom d'origine du fichier (indice heuristique).
 * @returns {Promise<{valide:boolean, raison?:string, champs_extraits?:object}>}
 */
async function verifierCNI(filePath, originalName = '') {
  // ── Remplacer CE bloc par l'appel à l'API réelle le moment venu ──
  if (MODE === 'always_valid') {
    return { valide: true, champs_extraits: champsFactices(originalName) };
  }
  if (MODE === 'always_invalid') {
    return { valide: false, raison: 'Document non reconnu comme une pièce d\'identité valide.' };
  }

  // Mode heuristique (par défaut)
  const nom = String(originalName).toLowerCase();
  if (MOTS_SUSPECTS.some((m) => nom.includes(m))) {
    return { valide: false, raison: 'L\'image ne correspond pas à une pièce d\'identité valide.' };
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.size < TAILLE_MIN) {
      return { valide: false, raison: 'Image trop petite ou illisible pour une vérification d\'identité.' };
    }
  } catch {
    return { valide: false, raison: 'Fichier introuvable lors de la vérification.' };
  }

  return { valide: true, champs_extraits: champsFactices(originalName) };
}

module.exports = { verifierCNI, MODE };
