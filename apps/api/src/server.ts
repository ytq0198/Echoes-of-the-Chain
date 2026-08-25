import { buildApp } from './app.js';
import { loadSessionConfig, SessionService } from './auth/session.js';
import { loadFabricConfig } from './ledger/fabric-config.js';
import { FabricCredentialLedger } from './ledger/fabric-ledger.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const ledger =
  process.env.FABRIC_ENABLED === 'true'
    ? new FabricCredentialLedger(loadFabricConfig())
    : undefined;
const sessionConfig = loadSessionConfig();
const sessions = sessionConfig ? new SessionService(sessionConfig) : undefined;
const app = buildApp({ ...(ledger ? { ledger } : {}), ...(sessions ? { sessions } : {}) });

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
