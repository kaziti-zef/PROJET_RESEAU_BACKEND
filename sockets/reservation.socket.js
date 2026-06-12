/**
 * Gestion des Sockets — Notifications temps réel
 *
 * Événements émis par le serveur :
 *   - nouvelle_reservation  → hôte notifié quand un client réserve
 *   - reservation_confirmee → client notifié quand l'hôte confirme
 *   - reservation_annulee   → les deux notifiés en cas d'annulation
 *
 * Côté client (exemple React/JS) :
 *   socket.emit('rejoindre', { userId: 5, role: 'CLIENT' });
 *   socket.on('reservation_confirmee', (data) => console.log(data));
 */

const initSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connecté: ${socket.id}`);

    // L'utilisateur rejoint sa room personnelle
    socket.on('rejoindre', ({ userId, role }) => {
      if (!userId || !role) return;

      const room = `${role.toLowerCase()}_${userId}`;
      socket.join(room);
      console.log(`👤 Utilisateur ${userId} (${role}) a rejoint la room: ${room}`);

      socket.emit('connecte', { message: `Connecté en tant que ${role}`, room });
    });

    // Déconnexion
    socket.on('disconnect', () => {
      console.log(`🔌 Socket déconnecté: ${socket.id}`);
    });
  });
};

module.exports = initSocket;
