import type { FastifyInstance } from 'fastify';

import { credentialFileSchema, parseStrictJson } from '@chaingrade/shared';

import type { CredentialLedger } from '../ledger/types.js';
import type { IssuerKeys } from '../vc/issuer-keys.js';
import { verifyCredentialFile } from '../vc/verifier.js';

interface RouteOptions {
  ledger?: CredentialLedger;
  issuerKeys?: IssuerKeys;
}

const MAX_VC_SIZE = 64 * 1024;

export async function registerVerifyRoutes(app: FastifyInstance, options: RouteOptions): Promise<void> {
  // Accept the uploaded credential as a raw string so duplicate keys and the exact
  // byte size can be validated before any schema check (Fastify's JSON parser would
  // silently drop duplicate keys).
  app.addContentTypeParser('application/vc+json', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
  });

  app.post('/api/v1/verify', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    if (!options.issuerKeys) return reply.code(503).send({ code: 'VC_KEYS_UNAVAILABLE' });

    const raw = request.body as string;
    if (Buffer.byteLength(raw, 'utf8') > MAX_VC_SIZE) {
      throw new Error('FILE_TOO_LARGE: 凭证文件超过大小限制');
    }

    let parsed: unknown;
    try {
      parsed = parseStrictJson(raw);
    } catch {
      throw new Error('INVALID_JSON: 凭证文件不是有效的 JSON');
    }

    const credential = credentialFileSchema.parse(parsed);
    const result = await verifyCredentialFile(
      credential,
      options.issuerKeys.publicKey,
      options.ledger,
    );

    reply.header('cache-control', 'no-store');
    return reply.send(result);
  });
}
