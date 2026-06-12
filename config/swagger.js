const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Room Renting API',
      version: '1.0.0',
      description: 'API Backend Room Renting — Location de chambres (Airbnb style)',
    },
    servers: [
      {
        url: 'http://localhost:4000/api',
        description: 'Serveur local',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Personne: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            email: { type: 'string' },
            nom: { type: 'string' },
            prenom: { type: 'string' },
            role: { type: 'string', enum: ['CLIENT', 'HOTE'] },
            raison_sociale: { type: 'string' },
          },
        },
        Annonce: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            titre: { type: 'string' },
            description: { type: 'string' },
            ville: { type: 'string' },
            quartier: { type: 'string' },
            adresse: { type: 'string' },
            prix: { type: 'number' },
            capacite: { type: 'integer' },
            disponible: { type: 'boolean' },
            images: { type: 'array', items: { type: 'string' } },
          },
        },
        Reservation: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            annonce_id: { type: 'integer' },
            date_debut: { type: 'string', format: 'date' },
            date_fin: { type: 'string', format: 'date' },
            nb_personnes: { type: 'integer' },
            statut: { type: 'string', enum: ['EN_ATTENTE', 'CONFIRMEE', 'ANNULEE', 'TERMINEE'] },
          },
        },
        Paiement: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            reservation_id: { type: 'integer' },
            montant: { type: 'number' },
            mode_paiement: { type: 'string', enum: ['CARTE', 'MOBILE_MONEY', 'ESPECES'] },
            date_paiement: { type: 'string', format: 'date-time' },
          },
        },
        Avis: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            annonce_id: { type: 'integer' },
            reservation_id: { type: 'integer' },
            note: { type: 'integer', minimum: 1, maximum: 5 },
            commentaire: { type: 'string' },
            date_avis: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./routes/*.js'],
};

module.exports = swaggerJsdoc(options);
