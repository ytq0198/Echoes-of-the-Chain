import { buildApp } from './app.js';
import { loadSessionConfig, SessionService } from './auth/session.js';
import { loadFabricConfig } from './ledger/fabric-config.js';
import { FabricCredentialLedger } from './ledger/fabric-ledger.js';
import { DemoCredentialLedger } from './ledger/demo-ledger.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const ledgerMode =
  process.env.FABRIC_ENABLED === 'true'
    ? 'fabric'
    : process.env.DEMO_ENABLED === 'true'
      ? 'demo'
      : 'unavailable';
const ledger =
  ledgerMode === 'fabric'
    ? new FabricCredentialLedger(loadFabricConfig())
    : ledgerMode === 'demo'
      ? new DemoCredentialLedger()
      : undefined;
const sessionConfig = loadSessionConfig();
const sessions = sessionConfig ? new SessionService(sessionConfig) : undefined;
const app = buildApp({
  ledgerMode,
  ...(ledger ? { ledger } : {}),
  ...(sessions ? { sessions } : {}),
});

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
