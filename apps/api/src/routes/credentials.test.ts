import { createHash } from 'node:crypto';

import type { PublicCredentialRecord, PublicDisclosureGrant } from '@chaingrade/shared';
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

function disclosureGrant(overrides: Partial<PublicDisclosureGrant> = {}): PublicDisclosureGrant {
  return {
    docType: 'gradeDisclosureGrant',
    grantId: 'grant:2026:api01',
    credentialId: 'cred:2026:api01',
    subjectHash: hash,
    issuerMspId: 'Org1MSP',
    tokenHash: hash,
    purposeHash: hash,
    verifierHash: hash,
    selectedFields: ['courseName', 'grade'],
    expiresAt: '2026-08-28T12:00:00.000Z',
    maxUses: 2,
    usedCount: 0,
    status: 'ACTIVE',
    createdByIdentityHash: hash,
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    transactionId: 'tx-grant-01',
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
    createBatchDrafts: vi.fn(async (commands) =>
      commands.map((command) =>
        activeRecord({
          credentialId: command.credentialId,
          detailHash: command.detailHash,
          status: 'PENDING_REVIEW',
          transactionId: 'tx-api-batch-01',
        }),
      ),
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
    reject: vi.fn(async (command) =>
      activeRecord({
        credentialId: command.credentialId,
        status: 'REJECTED',
        reasonHash: command.reasonHash,
      }),
    ),
    revoke: vi.fn(async (command) =>
      activeRecord({
        credentialId: command.credentialId,
        status: 'REVOKED',
        reasonHash: command.reasonHash,
      }),
    ),
    read: vi.fn(async (credentialId) => activeRecord({ credentialId })),
    listIssued: vi.fn(async (status) => ({
      items: [activeRecord({ status })],
      bookmark: '',
      fetchedRecordsCount: 1,
    })),
    listForReview: vi.fn(async (status) => ({
      items: [activeRecord({ status })],
      bookmark: '',
      fetchedRecordsCount: 1,
    })),
    listMine: vi.fn(async () => ({
      items: [activeRecord()],
      bookmark: '',
      fetchedRecordsCount: 1,
    })),
    readPrivateDetails: vi.fn(async () => ({
      courseName: '区块链技术与应用',
      score: 92,
      grade: 'A',
    })),
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
    createDisclosure: vi.fn(async (command) =>
      disclosureGrant({
        grantId: command.grantId,
        credentialId: command.credentialId,
        tokenHash: command.tokenHash,
        purposeHash: command.purposeHash,
        verifierHash: command.verifierHash,
        selectedFields: command.selectedFields,
        expiresAt: command.expiresAt,
        maxUses: command.maxUses,
      }),
    ),
    evaluateDisclosure: vi.fn(async () => ({ courseName: '区块链技术与应用', grade: 'A' })),
    consumeDisclosure: vi.fn(async (command) =>
      disclosureGrant({
        grantId: command.grantId,
        usedCount: 1,
      }),
    ),
    revokeDisclosure: vi.fn(async (grantId) =>
      disclosureGrant({
        grantId,
        status: 'REVOKED',
      }),
    ),
    listMyDisclosures: vi.fn(async () => ({
      items: [disclosureGrant()],
      bookmark: '',
      fetchedRecordsCount: 1,
    })),
    submitAppeal: vi.fn(),
    reviewAppeal: vi.fn(),
    readAppeal: vi.fn(),
    listAppealsForReview: vi.fn(),
    listMyAppeals: vi.fn(),
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

  it('submits a validated grade import through one atomic ledger call', async () => {
    const ledger = mockLedger();
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/imports',
      payload: {
        rows: [
          {
            credentialId: 'cred:2026:batch-api01',
            subjectHash: hash,
            courseHash: hash,
            schemaVersion: '1.0',
            details: {
              courseName: '区块链技术与应用',
              score: 92,
              grade: 'A',
              salt: 'BATCH_API_PRIVATE_SALT_01',
            },
          },
          {
            credentialId: 'cred:2026:batch-api02',
            subjectHash: hash,
            courseHash: hash,
            schemaVersion: '1.0',
            details: {
              courseName: '区块链技术与应用',
              score: 88,
              grade: 'B+',
              salt: 'BATCH_API_PRIVATE_SALT_02',
            },
          },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(ledger.createBatchDrafts).toHaveBeenCalledTimes(1);
    const commands = vi.mocked(ledger.createBatchDrafts).mock.calls[0]?.[0];
    expect(commands).toHaveLength(2);
    expect(commands?.[0]?.detailHash).toBe(
      createHash('sha256')
        .update(
          '{"courseName":"区块链技术与应用","grade":"A","salt":"BATCH_API_PRIVATE_SALT_01","score":92}',
        )
        .digest('hex'),
    );
    expect(response.json()).toMatchObject({ importedCount: 2, transactionId: 'tx-api-batch-01' });
    expect(response.body).not.toContain('BATCH_API_PRIVATE_SALT');
    expect(response.body).not.toContain('区块链技术与应用');
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

  it('hashes and forwards a private rejection decision', async () => {
    const ledger = mockLedger();
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api03/reject',
      payload: { reason: '原始成绩材料与草稿不一致。', salt: 'REJECTION_SAFE_SALT_12345' },
    });
    expect(response.statusCode).toBe(200);
    const canonical = '{"reason":"原始成绩材料与草稿不一致。","salt":"REJECTION_SAFE_SALT_12345"}';
    expect(ledger.reject).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonHash: createHash('sha256').update(canonical).digest('hex'),
        privateDecision: Buffer.from(canonical),
      }),
    );
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

  it('marks private grade details as non-cacheable', async () => {
    const ledger = mockLedger();
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/credentials/cred:2026:api01/private-details',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({ score: 92, grade: 'A' });
    await app.close();
  });

  it('validates and forwards review queue pagination to Fabric', async () => {
    const ledger = mockLedger();
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/credentials/review-queue?status=ACTIVE&pageSize=5&bookmark=cursor-1',
    });
    expect(response.statusCode).toBe(200);
    expect(ledger.listForReview).toHaveBeenCalledWith('ACTIVE', 5, 'cursor-1');
    expect(response.json().items).toHaveLength(1);
    const invalid = await app.inject({
      method: 'GET',
      url: '/api/v1/credentials/review-queue?pageSize=100',
    });
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });

  it('creates a one-time disclosure token without returning private grade details', async () => {
    const ledger = mockLedger();
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/disclosures',
      payload: {
        grantId: 'grant:2026:api01',
        selectedFields: ['courseName', 'grade'],
        purpose: '研究生申请材料核验',
        verifier: '目标院校招生办公室',
        expiresAt: '2026-08-28T12:00:00.000Z',
        maxUses: 2,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.body).not.toContain('score');
    expect(ledger.createDisclosure).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred:2026:api01',
        purposeHash: createHash('sha256').update('研究生申请材料核验').digest('hex'),
        verifierHash: createHash('sha256').update('目标院校招生办公室').digest('hex'),
        selectedFields: ['courseName', 'grade'],
        maxUses: 2,
      }),
    );
    await app.close();
  });

  it('consumes a disclosure with no-store and only returns selected fields', async () => {
    const ledger = mockLedger();
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/disclosures/grant:2026:api01/consume',
      payload: {
        token: 'A'.repeat(43),
        purpose: '研究生申请材料核验',
        verifier: '目标院校招生办公室',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().disclosed).toEqual({ courseName: '区块链技术与应用', grade: 'A' });
    expect(response.body).not.toContain('92');
    const canonical = Buffer.from(
      `{"purpose":"研究生申请材料核验","token":"${'A'.repeat(43)}","verifier":"目标院校招生办公室"}`,
    );
    expect(ledger.evaluateDisclosure).toHaveBeenCalledWith({
      grantId: 'grant:2026:api01',
      privateAccess: canonical,
    });
    expect(ledger.consumeDisclosure).toHaveBeenCalledWith({
      grantId: 'grant:2026:api01',
      privateAccess: canonical,
    });
    await app.close();
  });
});
