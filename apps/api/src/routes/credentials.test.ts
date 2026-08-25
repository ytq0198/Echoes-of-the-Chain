import { createHash } from 'node:crypto';

import type { PublicCredentialRecord } from '@chaingrade/shared';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { CredentialLedger } from '../ledger/types.js';

const hash = 'a'.repeat(64);

function activeRecord(overrides: Partial<PublicCredentialRecord> = {}): PublicCredentialRecord {
  return {
    docType: 'gradeCredential',
    credentialId: 'cred:2026:api01',
    subjectHash: hash,
    courseHash: hash,
    detailHash: hash,
    issuerMspId: 'Org1MSP',
    schemaVersion: '1.0',
    status: 'ACTIVE',
    version: 1,
    submittedByIdentityHash: hash,
    reviewedByIdentityHash: hash,
    issuedAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:01:00.000Z',
    transactionId: 'tx-api-01',
    ...overrides,
  };
}

function mockLedger(): CredentialLedger {
  return {
    createDraft: vi.fn(async (command) =>
      activeRecord({
        credentialId: command.credentialId,
        detailHash: command.detailHash,
        status: 'PENDING_REVIEW',
      }),
    ),
    createAmendment: vi.fn(async (previousCredentialId, command) =>
      activeRecord({
        credentialId: command.credentialId,
        detailHash: command.detailHash,
        previousCredentialId,
        status: 'PENDING_REVIEW',
        version: 2,
      }),
    ),
    approve: vi.fn(async (credentialId) => activeRecord({ credentialId })),
    read: vi.fn(async (credentialId) => activeRecord({ credentialId })),
    verify: vi.fn(async (credentialId) => ({
      credentialId,
      authentic: true,
      valid: true,
      status: 'ACTIVE',
      issuerMspId: 'Org1MSP',
      version: 1,
      updatedAt: '2026-08-25T00:01:00.000Z',
      transactionId: 'tx-api-01',
    })),
    submitAppeal: vi.fn(),
    reviewAppeal: vi.fn(),
    readAppeal: vi.fn(),
    close: vi.fn(),
  };
}

describe('credential routes', () => {
  it('returns 503 when the process has no Fabric configuration', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/credentials/cred:2026:api01',
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it('canonicalizes and hashes private details before ledger submission', async () => {
    const ledger = mockLedger();
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/drafts',
      payload: {
        credentialId: 'cred:2026:api02',
        subjectHash: hash,
        courseHash: hash,
        schemaVersion: '1.0',
        details: { score: 92, salt: 'SYNTHETIC_SALT_12345', grade: 'A' },
      },
    });
    expect(response.statusCode).toBe(201);

    const canonical = '{"grade":"A","salt":"SYNTHETIC_SALT_12345","score":92}';
    expect(ledger.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        detailHash: createHash('sha256').update(canonical).digest('hex'),
        privateDetails: Buffer.from(canonical),
      }),
    );
    await app.close();
  });

  it('uses the reviewer ledger path to approve a credential', async () => {
    const ledger = mockLedger();
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api03/approve',
    });
    expect(response.statusCode).toBe(200);
    expect(ledger.approve).toHaveBeenCalledWith('cred:2026:api03');
    await app.close();
  });

  it('inherits immutable identities when creating an amendment', async () => {
    const ledger = mockLedger();
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/amendments',
      payload: {
        credentialId: 'cred:2026:api01-v2',
        schemaVersion: '1.0',
        details: { score: 95, salt: 'AMENDMENT_SALT_12345', grade: 'A' },
      },
    });
    expect(response.statusCode).toBe(201);
    expect(ledger.createAmendment).toHaveBeenCalledWith(
      'cred:2026:api01',
      expect.objectContaining({ subjectHash: hash, courseHash: hash }),
    );
    await app.close();
  });
});
