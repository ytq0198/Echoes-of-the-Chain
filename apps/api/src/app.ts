import cors from '@fastify/cors';
import Fastify from 'fastify';

import type { SessionService } from './auth/session.js';
import type { CredentialLedger } from './ledger/types.js';
import { registerHttpErrorHandler } from './lib/http-errors.js';
import { registerAppealRoutes } from './routes/appeals.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCredentialRoutes } from './routes/credentials.js';

interface AppOptions {
  ledger?: CredentialLedger;
  sessions?: SessionService;
}

export function buildApp(options: AppOptions = {}) {
  const app = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024,
  });

  void app.register(cors, {
    origin: false,
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'chaingrade-api',
    version: '0.1.0',
  }));

  app.get('/api/v1/meta', async () => ({
    product: 'ChainGrade',
    repository: 'Echoes-of-the-Chain',
    phase: 'iteration-1',
    capabilities: [
      'credential-draft',
      'independent-review',
      'immutable-amendment',
      'revocation',
      'appeal',
      'fabric-gateway',
    ],
  }));

  if (options.sessions) void app.register(registerAuthRoutes, { sessions: options.sessions });
  const routeOptions = {
    ...(options.ledger ? { ledger: options.ledger } : {}),
    ...(options.sessions ? { sessions: options.sessions } : {}),
  };
  void app.register(registerCredentialRoutes, routeOptions);
  void app.register(registerAppealRoutes, routeOptions);
  registerHttpErrorHandler(app);

  app.addHook('onClose', async () => {
    options.ledger?.close();
  });

  return app;
}
