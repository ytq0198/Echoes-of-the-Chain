import cors from '@fastify/cors';
import Fastify from 'fastify';

export function buildApp() {
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
    phase: 'iteration-0',
    capabilities: [
      'credential-draft',
      'independent-review',
      'immutable-amendment',
      'revocation',
      'appeal',
    ],
  }));

  return app;
}
