const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const annonceRoutes = require('./routes/annonce.routes');
const reservationRoutes = require('./routes/reservation.routes');
const paiementRoutes = require('./routes/paiement.routes');
const avisRoutes = require('./routes/avis.routes');
const utilisateurRoutes = require('./routes/utilisateur.routes');
const adminAnnonceRoutes = require('./routes/adminAnnonce.routes');
const superAdminRoutes = require('./routes/superAdmin.routes');
const equipementRoutes = require('./routes/equipement.routes');
const hoteRoutes = require('./routes/hote.routes');
const paysRoutes = require('./routes/pays.routes');
const typeChambreRoutes = require('./routes/typeChambre.routes');
const caracteristiqueRoutes = require('./routes/caracteristique.routes');
const walletRoutes = require('./routes/wallet.routes');
const parametresRoutes = require('./routes/parametres.routes');

const app = express();

// ============================================
// MIDDLEWARES GLOBAUX
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir les images uploadées en statique (annonces + CNI, sous-dossiers de /uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// SWAGGER DOCUMENTATION
// ============================================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Room Renting API',
  customCss: '.swagger-ui .topbar { background-color: #FF5A5F; }',
}));

// ============================================
// ROUTES API
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/annonces', annonceRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/paiements', paiementRoutes);
app.use('/api/evaluations', avisRoutes);
app.use('/api/utilisateurs', utilisateurRoutes);
app.use('/api/admin', adminAnnonceRoutes);
app.use('/api/admin', superAdminRoutes);
app.use('/api/equipements', equipementRoutes);
app.use('/api/hote', hoteRoutes);
app.use('/api/pays', paysRoutes);
app.use('/api/types-chambre', typeChambreRoutes);
app.use('/api/caracteristiques', caracteristiqueRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', parametresRoutes);

// Route de santé
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Room Renting API opérationnelle',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// GESTION DES ERREURS 404
// ============================================
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} introuvable` });
});

// ============================================
// GESTION DES ERREURS GLOBALES
// ============================================
app.use((err, req, res, next) => {
  console.error('Erreur globale:', err.stack);

  if (err.message && (err.message.includes('images') || err.message.includes('CNI'))) {
    return res.status(400).json({ message: err.message });
  }

  res.status(500).json({ message: 'Erreur serveur interne' });
});

module.exports = app;
