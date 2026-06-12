const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const initSocket = require('./sockets/reservation.socket');
require('dotenv').config();

const PORT = process.env.PORT || 4000;

// ============================================
// CRÉER LE SERVEUR HTTP + SOCKET.IO
// ============================================
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Rendre io accessible dans les controllers via req.app.get('io')
app.set('io', io); 

// Initialiser les événements socket
initSocket(io);

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================
server.listen(PORT, () => {
  console.log('');
  console.log('🏠 ================================');
  console.log('   ROOM RENTING API — DÉMARRÉ');
  console.log('🏠 ================================');
  console.log(`🚀 Serveur    : http://localhost:${PORT}`);
  console.log(`📚 Swagger    : http://localhost:${PORT}/api-docs`);
  console.log(`❤️  Health     : http://localhost:${PORT}/api/health`);
  console.log(`🔌 Socket.io  : actif`);
  console.log('🏠 ================================');
  console.log('');
});
