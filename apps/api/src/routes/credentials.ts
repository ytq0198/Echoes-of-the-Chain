import { createHash } from 'node:crypto';

import { createCredentialRequestSchema, identifierSchema, sha256Schema } from '@chaingrade/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { canonicalJson } from '../lib/canonical-json.js';
import type { CredentialLedger } from '../ledger/types.js';

interface RouteOptions {
  ledger?: CredentialLedger;
}

const credentialParamsSchema = z.object({ credentialId: identifierSchema });

export async function registerCredentialRoutes(
  app: FastifyInstance,
  options: RouteOptions,
): Promise<void> {
  app.post('/api/v1/credentials/drafts', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    const input = createCredentialRequestSchema.parse(request.body);
    const privateDetails = Buffer.from(canonicalJson(input.details));
    const detailHash = createHash('sha256').update(privateDetails).digest('hex');
    const record = await options.ledger.createDraft({
      credentialId: input.credentialId,
      subjectHash: input.subjectHash,
      courseHash: input.courseHash,
      schemaVersion: input.schemaVersion,
      detailHash,
      privateDetails,
    });
    return reply.code(201).send(record);
  });

  app.post('/api/v1/credentials/:credentialId/approve', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    const { credentialId } = credentialParamsSchema.parse(request.params);
    return reply.send(await options.ledger.approve(credentialId));
  });

  app.get('/api/v1/credentials/:credentialId', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    const { credentialId } = credentialParamsSchema.parse(request.params);
    return reply.send(await options.ledger.read(credentialId));
  });

  app.get('/api/v1/credentials/:credentialId/verify', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    const { credentialId } = credentialParamsSchema.parse(request.params);
    const query = z.object({ detailHash: sha256Schema.optional() }).parse(request.query);
    return reply.send(await options.ledger.verify(credentialId, query.detailHash));
  });
}

