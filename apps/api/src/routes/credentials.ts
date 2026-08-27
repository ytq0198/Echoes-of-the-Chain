import { createHash, randomBytes } from 'node:crypto';

import {
  createAmendmentRequestSchema,
  createCredentialRequestSchema,
  createDisclosureRequestSchema,
  consumeDisclosureRequestSchema,
  credentialListQuerySchema,
  credentialDecisionRequestSchema,
  gradeBatchImportRequestSchema,
  identifierSchema,
  sha256Schema,
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

const credentialParamsSchema = z.object({ credentialId: identifierSchema });
const disclosureParamsSchema = z.object({ grantId: identifierSchema });

export async function registerCredentialRoutes(
  app: FastifyInstance,
  options: RouteOptions,
): Promise<void> {
  app.get('/api/v1/credentials/issued', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'issuer');
    const query = credentialListQuerySchema.parse(request.query);
    return reply.send(
      await options.ledger.listIssued(
        query.status ?? 'PENDING_REVIEW',
        query.pageSize,
        query.bookmark,
      ),
    );
  });

  app.get('/api/v1/credentials/review-queue', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'reviewer');
    const query = credentialListQuerySchema.parse(request.query);
    return reply.send(
      await options.ledger.listForReview(
        query.status ?? 'PENDING_REVIEW',
        query.pageSize,
        query.bookmark,
      ),
    );
  });

  app.get('/api/v1/credentials/mine', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'student');
    const query = credentialListQuerySchema.omit({ status: true }).parse(request.query);
    return reply.send(await options.ledger.listMine(query.pageSize, query.bookmark));
  });

  app.post('/api/v1/credentials/drafts', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'issuer', { csrf: true });
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

  app.post('/api/v1/credentials/imports', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'issuer', { csrf: true });
    const input = gradeBatchImportRequestSchema.parse(request.body);
    const commands = input.rows.map((row) => {
      const privateDetails = Buffer.from(canonicalJson(row.details));
      return {
        credentialId: row.credentialId,
        subjectHash: row.subjectHash,
        courseHash: row.courseHash,
        schemaVersion: row.schemaVersion,
        detailHash: createHash('sha256').update(privateDetails).digest('hex'),
        privateDetails,
      };
    });
    const items = await options.ledger.createBatchDrafts(commands);
    reply.header('cache-control', 'no-store');
    return reply.code(201).send({
      items,
      importedCount: items.length,
      transactionId: items[0]?.transactionId ?? '',
    });
  });

  app.post('/api/v1/credentials/:credentialId/approve', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'reviewer', { csrf: true });
    const { credentialId } = credentialParamsSchema.parse(request.params);
    return reply.send(await options.ledger.approve(credentialId));
  });

  app.post('/api/v1/credentials/:credentialId/reject', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'reviewer', { csrf: true });
    const { credentialId } = credentialParamsSchema.parse(request.params);
    const input = credentialDecisionRequestSchema.parse(request.body);
    const privateDecision = Buffer.from(canonicalJson(input));
    const reasonHash = createHash('sha256').update(privateDecision).digest('hex');
    return reply.send(await options.ledger.reject({ credentialId, reasonHash, privateDecision }));
  });

  app.post('/api/v1/credentials/:credentialId/revoke', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'reviewer', { csrf: true });
    const { credentialId } = credentialParamsSchema.parse(request.params);
    const input = credentialDecisionRequestSchema.parse(request.body);
    const privateDecision = Buffer.from(canonicalJson(input));
    const reasonHash = createHash('sha256').update(privateDecision).digest('hex');
    return reply.send(await options.ledger.revoke({ credentialId, reasonHash, privateDecision }));
  });

  app.post('/api/v1/credentials/:credentialId/amendments', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'issuer', { csrf: true });
    const { credentialId: previousCredentialId } = credentialParamsSchema.parse(request.params);
    const input = createAmendmentRequestSchema.parse(request.body);
    const previous = await options.ledger.read(previousCredentialId);
    const privateDetails = Buffer.from(canonicalJson(input.details));
    const detailHash = createHash('sha256').update(privateDetails).digest('hex');
    const record = await options.ledger.createAmendment(previousCredentialId, {
      credentialId: input.credentialId,
      subjectHash: previous.subjectHash,
      courseHash: previous.courseHash,
      schemaVersion: input.schemaVersion,
      detailHash,
      privateDetails,
    });
    return reply.code(201).send(record);
  });

  app.get('/api/v1/credentials/:credentialId', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    const { credentialId } = credentialParamsSchema.parse(request.params);
    return reply.send(await options.ledger.read(credentialId));
  });

  app.get('/api/v1/credentials/:credentialId/private-details', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'student');
    const { credentialId } = credentialParamsSchema.parse(request.params);
    reply.header('cache-control', 'no-store');
    return reply.send(await options.ledger.readPrivateDetails(credentialId));
  });

  app.get('/api/v1/credentials/:credentialId/verify', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    const { credentialId } = credentialParamsSchema.parse(request.params);
    const query = z.object({ detailHash: sha256Schema.optional() }).parse(request.query);
    return reply.send(await options.ledger.verify(credentialId, query.detailHash));
  });

  app.post('/api/v1/credentials/:credentialId/disclosures', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'student', { csrf: true });
    const { credentialId } = credentialParamsSchema.parse(request.params);
    const input = createDisclosureRequestSchema.parse(request.body);
    const token = randomBytes(32).toString('base64url');
    const grant = await options.ledger.createDisclosure({
      grantId: input.grantId,
      credentialId,
      tokenHash: hashText(token),
      purposeHash: hashText(input.purpose),
      verifierHash: hashText(input.verifier),
      selectedFields: input.selectedFields,
      expiresAt: new Date(input.expiresAt).toISOString(),
      maxUses: input.maxUses,
    });
    reply.header('cache-control', 'no-store');
    return reply.code(201).send({ grant, token });
  });

  app.get('/api/v1/disclosures/mine', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'student');
    const query = credentialListQuerySchema.omit({ status: true }).parse(request.query);
    return reply.send(await options.ledger.listMyDisclosures(query.pageSize, query.bookmark));
  });

  app.post('/api/v1/disclosures/:grantId/revoke', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    options.sessions?.authorize(request, 'student', { csrf: true });
    const { grantId } = disclosureParamsSchema.parse(request.params);
    return reply.send(await options.ledger.revokeDisclosure(grantId));
  });

  app.post('/api/v1/disclosures/:grantId/consume', async (request, reply) => {
    if (!options.ledger) return reply.code(503).send({ code: 'FABRIC_UNAVAILABLE' });
    const { grantId } = disclosureParamsSchema.parse(request.params);
    const input = consumeDisclosureRequestSchema.parse(request.body);
    const command = {
      grantId,
      privateAccess: Buffer.from(canonicalJson(input)),
    };
    const disclosed = await options.ledger.evaluateDisclosure(command);
    const grant = await options.ledger.consumeDisclosure(command);
    reply.header('cache-control', 'no-store');
    return reply.send({ grant, disclosed });
  });
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
