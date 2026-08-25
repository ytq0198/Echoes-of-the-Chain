import { buildApp } from './app.js';
import { loadFabricConfig } from './ledger/fabric-config.js';
import { FabricCredentialLedger } from './ledger/fabric-ledger.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const ledger =
  process.env.FABRIC_ENABLED === 'true'
    ? new FabricCredentialLedger(loadFabricConfig())
    : undefined;
const app = ledger ? buildApp({ ledger }) : buildApp();

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
