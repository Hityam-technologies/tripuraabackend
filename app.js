const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const { getEnv } = require('./config/env');
const { corsMiddleware } = require('./config/cors');
const { requestId } = require('./middleware/requestId');
const { sanitize } = require('./middleware/sanitize');
const { generalLimiter } = require('./middleware/rateLimit');
const { notFound } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');
const { createRuntime } = require('./services/tryon');
const { setRunner } = require('./services/tryon/tryOn.service');

function createApp() {
  const env = getEnv();
  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', 1);

  app.use(requestId);
  // cross-origin lets the admin site (a different address) read API data and images.
  // The allow-list in cors.js still decides who may call the API.
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(corsMiddleware);
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(':method :url :status :response-time ms req=:req[x-request-id]'));
  }
  app.use(sanitize);
  app.use('/api', generalLimiter);

  const publicDir = path.resolve(env.UPLOAD_DIR, 'public');
  app.use('/uploads/public', express.static(publicDir));

  const runtime = createRuntime();
  setRunner(runtime.runner);
  app.set('jobRunner', runtime.runner);
  app.set('tryOnProvider', runtime.provider);
  if (env.NODE_ENV !== 'test' && env.tryOnProvider !== 'disabled') runtime.runner.start();

  app.get('/', (_req, res) => {
    res.status(200).json({ success: true, data: { service: 'tripuraa-api' } });
  });
  app.use('/api/v1', routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
