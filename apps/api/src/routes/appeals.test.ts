import { createHash } from 'node:crypto';

import type { PublicAppealRecord, PublicCredentialRecord } from '@chaingrade/shared';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { CredentialLedger } from '../ledger/types.js';

const hash = 'a'.repeat(64);

function appealRecord(overrides: Partial<PublicAppealRecord> = {}): PublicAppealRecord {
  return {
    docType: 'gradeAppeal',
    appealId: 'appeal:2026:api01',
    credentialId: 'cred:2026:api01',
    subjectHash: hash,
    issuerMspId: 'Org1MSP',
    reasonHash: hash,
    status: 'OPEN',
    submittedAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    submittedByIdentityHash: hash,
    transactionId: 'tx-appeal-01',
    ...overrides,
  };
}

function mockLedger(): CredentialLedger {
  const credential = { subjectHash: hash, courseHash: hash } as PublicCredentialRecord;
  return {
    createDraft: vi.fn(),
    createAmendment: vi.fn(),
    approve: vi.fn(),
    read: vi.fn(async () => credential),
    listIssued: vi.fn(),
    listForReview: vi.fn(),
    listMine: vi.fn(),
    readPrivateDetails: vi.fn(),
    verify: vi.fn(),
    submitAppeal: vi.fn(async (command) =>
      appealRecord({ appealId: command.appealId, credentialId: command.credentialId, reasonHash: command.reasonHash }),
    ),
    reviewAppeal: vi.fn(async (command) =>
      appealRecord({
        appealId: command.appealId,
        status: command.decision === 'ACCEPTED' ? 'RESOLVED_ACCEPTED' : 'RESOLVED_REJECTED',
        resolutionHash: command.resolutionHash,
      }),
    ),
    readAppeal: vi.fn(async (appealId) => appealRecord({ appealId })),
    listAppealsForReview: vi.fn(async (status) => ({ items: [appealRecord({ status })], bookmark: '', fetchedRecordsCount: 1 })),
    listMyAppeals: vi.fn(async () => ({ items: [appealRecord()], bookmark: '', fetchedRecordsCount: 1 })),
    close: vi.fn(),
  };
}

describe('appeal routes', () => {
  it('canonicalizes private appeal details and submits with the student identity path', async () => {
    const ledger = mockLedger();
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/appeals',
      payload: {
        appealId: 'appeal:2026:api02',
        details: { reason: '实验分数未计入总评。', salt: 'APPEAL_SAFE_SALT_12345' },
      },
    });
    expect(response.statusCode).toBe(201);
    const canonical = '{"reason":"实验分数未计入总评。","salt":"APPEAL_SAFE_SALT_12345"}';
    expect(ledger.submitAppeal).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonHash: createHash('sha256').update(canonical).digest('hex'),
        privateDetails: Buffer.from(canonical),
      }),
    );
    await app.close();
  });

  it('hashes a private resolution before reviewer submission', async () => {
    const ledger = mockLedger();
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/appeals/appeal:2026:api01/review',
      payload: {
        decision: 'ACCEPTED',
        resolution: { summary: '核验原始实验记录后同意修订。', salt: 'RESOLUTION_SALT_12345' },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(ledger.reviewAppeal).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'ACCEPTED', privateResolution: expect.any(Buffer) }),
    );
    await app.close();
  });

  it('returns a stable validation error without exposing internals', async () => {
    const app = buildApp({ ledger: mockLedger() });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/appeals',
      payload: { appealId: 'bad', details: { reason: '短', salt: 'short' } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    await app.close();
  });

  it('maps a Fabric peer detail to a stable business error', async () => {
    const ledger = mockLedger();
    vi.mocked(ledger.submitAppeal).mockRejectedValueOnce(
      Object.assign(new Error('failed to endorse transaction'), {
        details: [{ message: 'chaincode response 500, INVALID_STATE: only active records' }],
      }),
    );
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials/cred:2026:api01/appeals',
      payload: {
        appealId: 'appeal:2026:error01',
        details: { reason: '请求复核当前成绩记录。', salt: 'APPEAL_ERROR_SALT_12345' },
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'INVALID_STATE', message: '记录当前状态不允许此操作' });
    await app.close();
  });

  it('loads the paginated reviewer appeal queue', async () => {
    const ledger = mockLedger();
    const app = buildApp({ ledger });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/appeals/review-queue?status=RESOLVED_ACCEPTED&pageSize=8',
    });
    expect(response.statusCode).toBe(200);
    expect(ledger.listAppealsForReview).toHaveBeenCalledWith('RESOLVED_ACCEPTED', 8, '');
    expect(response.json().items[0].issuerMspId).toBe('Org1MSP');
    await app.close();
  });
});
