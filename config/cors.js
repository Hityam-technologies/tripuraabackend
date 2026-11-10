const cors = require('cors');
const { getEnv } = require('./env');

function corsMiddleware(req, res, next) {
  const env = getEnv();
  const origin = req.headers.origin;
  const isAdmin = Boolean(origin) && origin === env.ADMIN_ORIGIN;
  const appAllowed = Boolean(origin) && env.corsOrigins.includes(origin);
  const allowed = !origin || isAdmin || appAllowed;

  return cors({
    origin: allowed ? origin || true : false,
    credentials: isAdmin,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })(req, res, next);
}

module.exports = { corsMiddleware };
