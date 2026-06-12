/**
 * Middleware de vérification du rôle
 * Usage: roleMiddleware('HOTE') ou roleMiddleware('CLIENT')
 */
const roleMiddleware = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Accès refusé. Rôle requis : ${roles.join(' ou ')}`,
      });
    }

    next();
  };
};

module.exports = roleMiddleware;
