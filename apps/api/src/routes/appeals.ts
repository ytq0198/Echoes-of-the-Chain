import { createHash } from 'node:crypto';

import {
  createAppealRequestSchema,
  appealListQuerySchema,
  identifierSchema,
  reviewAppealRequestSchema,
} from '@chaingrade/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { canonicalJson } from '../lib/canonical-json.js';
import type { SessionService } from '../auth/session.js';
import type { CredentialLedger } from '../ledger/types.js';

interface RouteOptions {
  ledger?: CredentialLedger;
  sessions?: SessionService;
}

const appealParamsSchema = z.object({ appealId: identifierSchema });
const credentialParamsSchema = z.object({ credentialId: identifierSchema });

export async function registerAppealRoutes(
  app: FastifyInstance,
  options: RouteOptions,
): Promise<void> {
  app.get('/api/v1/appeals/review-queue', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'reviewer');
    const query = appealListQuerySchema.parse(request.query);
    return reply.send(await options.ledger.listAppealsForReview(query.status ?? 'OPEN', query.pageSize, query.bookmark));
  });

  app.get('/api/v1/appeals/mine', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'student');
    const query = appealListQuerySchema.omit({ status: true }).parse(request.query);
    return reply.send(await options.ledger.listMyAppeals(query.pageSize, query.bookmark));
  });

  app.post('/api/v1/credentials/:credentialId/appeals', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'student', { csrf: true });
    const { credentialId } = credentialParamsSchema.parse(request.params);
    const input = createAppealRequestSchema.parse(request.body);
    const privateDetails = Buffer.from(canonicalJson(input.details));
    const reasonHash = createHash('sha256').update(privateDetails).digest('hex');
    const appeal = await options.ledger.submitAppeal({
      appealId: input.appealId,
      credentialId,
      reasonHash,
      privateDetails,
    });
    return reply.code(201).send(appeal);
  });

  app.get('/api/v1/appeals/:appealId', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'reviewer');
    const { appealId } = appealParamsSchema.parse(request.params);
    return reply.send(await options.ledger.readAppeal(appealId));
  });

  app.post('/api/v1/appeals/:appealId/review', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'reviewer', { csrf: true });
    const { appealId } = appealParamsSchema.parse(request.params);
    const input = reviewAppealRequestSchema.parse(request.body);
    const privateResolution = Buffer.from(canonicalJson(input.resolution));
    const resolutionHash = createHash('sha256').update(privateResolution).digest('hex');
    return reply.send(
      await options.ledger.reviewAppeal({
        appealId,
        decision: input.decision,
        resolutionHash,
        privateResolution,
      }),
    );
  });
}
