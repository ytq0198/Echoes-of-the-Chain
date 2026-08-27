import { createHash } from 'node:crypto';

import type { Context } from 'fabric-contract-api';
import { beforeEach, describe, expect, it } from 'vitest';

import { GradeContract } from './grade-contract';
import type { AppealRecord, CredentialRecord } from './model';

interface IdentityOptions {
  id: string;
  mspId: string;
  role: 'issuer' | 'reviewer' | 'student';
  subjectHash?: string;
}

class MockLedger {
  public readonly state = new Map<string, Buffer>();
  public readonly privateState = new Map<string, Buffer>();
  public transient = new Map<string, Buffer>();
  public txId = 'tx-0001';
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function context(ledger: MockLedger, identity: IdentityOptions): Context {
  const compositeKey = (objectType: string, attributes: string[]) =>
    `\u0000${objectType}\u0000${attributes.join('\u0000')}\u0000`;
  const iterator = (entries: [string, Buffer][]) => {
    let cursor = 0;
    return {
      async *[Symbol.asyncIterator]() {
        for (const [key, value] of entries) yield { key, value, namespace: '' };
      },
      close: async () => undefined,
      next: async () => {
        const entry = entries[cursor++];
        return entry
          ? { done: false, value: { key: entry[0], value: entry[1], namespace: '' } }
          : { done: true };
      },
    };
  };
  return {
    clientIdentity: {
      getID: () => identity.id,
      getMSPID: () => identity.mspId,
      getAttributeValue: (name: string) => {
        if (name === 'app.role') return identity.role;
        if (name === 'subject.hash') return identity.subjectHash ?? null;
        return null;
      },
    },
    stub: {
      getState: async (key: string) => ledger.state.get(key) ?? Buffer.alloc(0),
      putState: async (key: string, value: Uint8Array) => {
        ledger.state.set(key, Buffer.from(value));
      },
      deleteState: async (key: string) => {
        ledger.state.delete(key);
      },
      createCompositeKey: compositeKey,
      splitCompositeKey: (key: string) => {
        const [objectType, ...attributes] = key.split('\u0000').filter(Boolean);
        return { objectType, attributes };
      },
      getStateByPartialCompositeKeyWithPagination: async (
        objectType: string,
        attributes: string[],
        pageSize: number,
        bookmark = '',
      ) => {
        const prefix = compositeKey(objectType, attributes).slice(0, -1);
        const candidates = [...ledger.state.entries()]
          .filter(([key]) => key.startsWith(prefix) && key > bookmark)
          .sort(([left], [right]) => left.localeCompare(right));
        const page = candidates.slice(0, pageSize);
        return {
          iterator: iterator(page),
          metadata: {
            fetchedRecordsCount: page.length,
            bookmark: candidates.length > page.length ? (page.at(-1)?.[0] ?? '') : '',
          },
        };
      },
      getStateByPartialCompositeKey: async (objectType: string, attributes: string[]) => {
        const prefix = compositeKey(objectType, attributes).slice(0, -1);
        return iterator(
          [...ledger.state.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .sort(([left], [right]) => left.localeCompare(right)),
        );
      },
      getStateByRange: async (startKey: string, endKey: string) =>
        iterator(
          [...ledger.state.entries()]
            .filter(([key]) => key >= startKey && key < endKey)
            .sort(([left], [right]) => left.localeCompare(right)),
        ),
      getTransient: () => ledger.transient,
      putPrivateData: async (collection: string, key: string, value: Uint8Array) => {
        ledger.privateState.set(`${collection}:${key}`, Buffer.from(value));
      },
      getPrivateData: async (collection: string, key: string) =>
        ledger.privateState.get(`${collection}:${key}`) ?? Buffer.alloc(0),
      getTxID: () => ledger.txId,
      getTxTimestamp: () => ({ seconds: { toString: () => '1787587200' }, nanos: 0 }),
    },
  } as unknown as Context;
}

const subjectHash = sha256('student:alice:random-salt');
const courseHash = sha256('course:blockchain:random-salt');
const gradeDetails = Buffer.from(
  JSON.stringify({ score: 92, grade: 'A', salt: 'RANDOM_TEST_SALT' }),
);

function draft(credentialId: string) {
  return JSON.stringify({
    credentialId,
    subjectHash,
    courseHash,
    detailHash: sha256(gradeDetails),
    schemaVersion: '1.0',
  });
}

describe('GradeContract', () => {
  let ledger: MockLedger;
  let contract: GradeContract;
  const issuer = { id: 'x509::issuer-alice', mspId: 'UniversityAMSP', role: 'issuer' } as const;
  const reviewer = { id: 'x509::reviewer-bob', mspId: 'UniversityAMSP', role: 'reviewer' } as const;

  beforeEach(() => {
    ledger = new MockLedger();
    contract = new GradeContract();
    ledger.transient.set('gradeDetails', gradeDetails);
  });

  it('creates a private draft and activates it after independent review', async () => {
    const created = JSON.parse(
      await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:0001')),
    ) as CredentialRecord;
    expect(created.status).toBe('PENDING_REVIEW');
    expect(JSON.stringify(created)).not.toContain('92');
    expect(
      ledger.privateState.get('_implicit_org_UniversityAMSP:credential:cred:2026:0001'),
    ).toEqual(gradeDetails);

    ledger.txId = 'tx-0002';
    const approved = JSON.parse(
      await contract.ApproveCredential(context(ledger, reviewer), created.credentialId),
    ) as CredentialRecord;
    expect(approved.status).toBe('ACTIVE');
    expect(approved.reviewedByIdentityHash).not.toBe(approved.submittedByIdentityHash);
  });

  it('creates multiple private drafts in one atomic batch transaction', async () => {
    const secondDetails = Buffer.from(
      JSON.stringify({ score: 88, grade: 'B+', salt: 'SECOND_BATCH_SALT' }),
    );
    const drafts = [
      JSON.parse(draft('cred:2026:batch01')),
      { ...JSON.parse(draft('cred:2026:batch02')), detailHash: sha256(secondDetails) },
    ];
    ledger.transient.set(
      'gradeBatch',
      Buffer.from(
        JSON.stringify({
          'cred:2026:batch01': gradeDetails.toString('base64'),
          'cred:2026:batch02': secondDetails.toString('base64'),
        }),
      ),
    );

    const records = JSON.parse(
      await contract.CreateCredentialBatch(context(ledger, issuer), JSON.stringify({ drafts })),
    ) as CredentialRecord[];
    expect(records).toHaveLength(2);
    expect(new Set(records.map((record) => record.transactionId))).toEqual(new Set(['tx-0001']));
    expect(records.every((record) => record.status === 'PENDING_REVIEW')).toBe(true);
    expect(
      ledger.privateState.get('_implicit_org_UniversityAMSP:credential:cred:2026:batch02'),
    ).toEqual(secondDetails);
    expect(JSON.stringify(records)).not.toContain('SECOND_BATCH_SALT');
  });

  it('prevalidates the full batch before writing any record', async () => {
    const first = JSON.parse(draft('cred:2026:atomic01'));
    const second = { ...JSON.parse(draft('cred:2026:atomic02')), detailHash: sha256('wrong') };
    ledger.transient.set(
      'gradeBatch',
      Buffer.from(
        JSON.stringify({
          'cred:2026:atomic01': gradeDetails.toString('base64'),
          'cred:2026:atomic02': gradeDetails.toString('base64'),
        }),
      ),
    );

    await expect(
      contract.CreateCredentialBatch(
        context(ledger, issuer),
        JSON.stringify({ drafts: [first, second] }),
      ),
    ).rejects.toThrow('HASH_MISMATCH');
    expect(ledger.state.has('credential:cred:2026:atomic01')).toBe(false);
    expect(ledger.privateState.size).toBe(0);

    ledger.transient.set(
      'gradeBatch',
      Buffer.from(
        JSON.stringify({
          'cred:2026:atomic01': gradeDetails.toString('base64'),
        }),
      ),
    );
    await expect(
      contract.CreateCredentialBatch(
        context(ledger, issuer),
        JSON.stringify({ drafts: [first, first] }),
      ),
    ).rejects.toThrow('unique within a batch');
    expect(ledger.state.has('credential:cred:2026:atomic01')).toBe(false);
  });

  it('rejects self-approval even when the certificate has reviewer role', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:0002'));
    const sameCertificateWithReviewerRole = { ...issuer, role: 'reviewer' as const };
    await expect(
      contract.ApproveCredential(
        context(ledger, sameCertificateWithReviewerRole),
        'cred:2026:0002',
      ),
    ).rejects.toThrow('SEPARATION_OF_DUTIES');
  });

  it('rejects private details that do not match the public commitment', async () => {
    ledger.transient.set('gradeDetails', Buffer.from('{"score":60}'));
    await expect(
      contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:0003')),
    ).rejects.toThrow('HASH_MISMATCH');
  });

  it('rejects unauthorized roles and duplicate identifiers', async () => {
    const student = {
      id: 'x509::student-alice',
      mspId: 'UniversityAMSP',
      role: 'student',
      subjectHash,
    } as const;
    await expect(
      contract.CreateCredentialDraft(context(ledger, student), draft('cred:2026:auth1')),
    ).rejects.toThrow('requires issuer role');

    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:dupe1'));
    await expect(
      contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:dupe1')),
    ).rejects.toThrow('ALREADY_EXISTS');
  });

  it('records a rejected draft without exposing the rejection text', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:reject1'));
    const decision = Buffer.from(
      '{"reason":"source document requires correction","salt":"REJECT_SAFE_SALT"}',
    );
    ledger.transient.set('credentialDecision', decision);
    const reasonHash = sha256(decision);
    const rejected = JSON.parse(
      await contract.RejectCredential(context(ledger, reviewer), 'cred:2026:reject1', reasonHash),
    ) as CredentialRecord;
    expect(rejected).toMatchObject({ status: 'REJECTED', reasonHash });
    expect(JSON.stringify(rejected)).not.toContain('source document requires correction');
    expect(
      ledger.privateState.get('_implicit_org_UniversityAMSP:credential:cred:2026:reject1:decision'),
    ).toEqual(decision);
    await expect(
      contract.ApproveCredential(context(ledger, reviewer), 'cred:2026:reject1'),
    ).rejects.toThrow('INVALID_STATE');
  });

  it('blocks a reviewer from another organization', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:org01'));
    const externalReviewer = {
      id: 'x509::reviewer-at-university-b',
      mspId: 'UniversityBMSP',
      role: 'reviewer',
    } as const;
    await expect(
      contract.ApproveCredential(context(ledger, externalReviewer), 'cred:2026:org01'),
    ).rejects.toThrow('different organization');
  });

  it('atomically supersedes the prior credential when an amendment is approved', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:old1'));
    await contract.ApproveCredential(context(ledger, reviewer), 'cred:2026:old1');

    const amendedDetails = Buffer.from(
      JSON.stringify({ score: 95, grade: 'A+', salt: 'SECOND_RANDOM_SALT' }),
    );
    ledger.transient.set('gradeDetails', amendedDetails);
    await contract.CreateAmendmentDraft(
      context(ledger, issuer),
      'cred:2026:old1',
      JSON.stringify({
        credentialId: 'cred:2026:new1',
        subjectHash,
        courseHash,
        detailHash: sha256(amendedDetails),
        schemaVersion: '1.0',
      }),
    );
    await contract.ApproveCredential(context(ledger, reviewer), 'cred:2026:new1');

    const oldRecord = JSON.parse(
      await contract.ReadCredential(context(ledger, issuer), 'cred:2026:old1'),
    ) as CredentialRecord;
    const newRecord = JSON.parse(
      await contract.ReadCredential(context(ledger, issuer), 'cred:2026:new1'),
    ) as CredentialRecord;
    expect(oldRecord.status).toBe('SUPERSEDED');
    expect(newRecord.status).toBe('ACTIVE');
    expect(newRecord.previousCredentialId).toBe(oldRecord.credentialId);
    expect(newRecord.version).toBe(2);
  });

  it('does not allow an amendment to change subject identity', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:fixed1'));
    await contract.ApproveCredential(context(ledger, reviewer), 'cred:2026:fixed1');
    const changedDraft = JSON.parse(draft('cred:2026:changed1')) as Record<string, string>;
    changedDraft.subjectHash = sha256('different student');
    await expect(
      contract.CreateAmendmentDraft(
        context(ledger, issuer),
        'cred:2026:fixed1',
        JSON.stringify(changedDraft),
      ),
    ).rejects.toThrow('IMMUTABLE_IDENTITY');
  });

  it('requires transient private data and reports missing records safely', async () => {
    ledger.transient.clear();
    await expect(
      contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:private1')),
    ).rejects.toThrow('MISSING_PRIVATE_DATA');
    await expect(
      contract.ReadCredential(context(ledger, issuer), 'cred:2026:missing1'),
    ).rejects.toThrow('NOT_FOUND');
    await expect(contract.ReadAppeal(context(ledger, issuer), 'appeal:2026:none1')).rejects.toThrow(
      'NOT_FOUND',
    );
  });

  it('allows only the credential subject to submit an appeal', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:0004'));
    await contract.ApproveCredential(context(ledger, reviewer), 'cred:2026:0004');
    const appealDetails = Buffer.from(
      JSON.stringify({ reason: 'The lab component was omitted.', salt: 'APPEAL_SALT' }),
    );
    ledger.transient.set('appealDetails', appealDetails);

    const wrongStudent = {
      id: 'x509::student-mallory',
      mspId: 'UniversityAMSP',
      role: 'student',
      subjectHash: sha256('someone-else'),
    } as const;
    await expect(
      contract.SubmitAppeal(
        context(ledger, wrongStudent),
        'appeal:2026:0001',
        'cred:2026:0004',
        sha256(appealDetails),
      ),
    ).rejects.toThrow('FORBIDDEN');

    const student = { ...wrongStudent, subjectHash };
    const submitted = JSON.parse(
      await contract.SubmitAppeal(
        context(ledger, student),
        'appeal:2026:0001',
        'cred:2026:0004',
        sha256(appealDetails),
      ),
    ) as AppealRecord;
    expect(submitted.status).toBe('OPEN');

    const resolutionDetails = Buffer.from(
      JSON.stringify({ summary: 'The appeal is accepted.', salt: 'RESOLUTION_SAFE_SALT' }),
    );
    ledger.transient.set('appealResolution', resolutionDetails);
    const resolved = JSON.parse(
      await contract.ReviewAppeal(
        context(ledger, reviewer),
        submitted.appealId,
        'ACCEPTED',
        sha256(resolutionDetails),
      ),
    ) as AppealRecord;
    expect(resolved.status).toBe('RESOLVED_ACCEPTED');
    expect(
      ledger.privateState.get('_implicit_org_UniversityAMSP:appeal:appeal:2026:0001:resolution'),
    ).toEqual(resolutionDetails);
  });

  it('allows only the credential subject to read private grade details', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:private-read'));
    await contract.ApproveCredential(context(ledger, reviewer), 'cred:2026:private-read');
    const student = {
      id: 'x509::student-alice',
      mspId: 'UniversityAMSP',
      role: 'student',
      subjectHash,
    } as const;
    expect(
      await contract.ReadPrivateCredential(context(ledger, student), 'cred:2026:private-read'),
    ).toBe(gradeDetails.toString('utf8'));
    await expect(
      contract.ReadPrivateCredential(
        context(ledger, { ...student, subjectHash: sha256('different-student') }),
        'cred:2026:private-read',
      ),
    ).rejects.toThrow('FORBIDDEN');
    await expect(
      contract.ReadPrivateCredential(context(ledger, reviewer), 'cred:2026:private-read'),
    ).rejects.toThrow('requires student role');
  });

  it('does not let an identity from another organization appeal an issued credential', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:0006'));
    await contract.ApproveCredential(context(ledger, reviewer), 'cred:2026:0006');
    const appealDetails = Buffer.from('{"reason":"cross-org attempt","salt":"SAFE_SALT"}');
    ledger.transient.set('appealDetails', appealDetails);
    const crossOrgStudent = {
      id: 'x509::student-alice-at-university-b',
      mspId: 'UniversityBMSP',
      role: 'student',
      subjectHash,
    } as const;

    await expect(
      contract.SubmitAppeal(
        context(ledger, crossOrgStudent),
        'appeal:2026:0002',
        'cred:2026:0006',
        sha256(appealDetails),
      ),
    ).rejects.toThrow('different organization');
  });

  it('reports a revoked credential as authentic but invalid', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:0005'));
    await contract.ApproveCredential(context(ledger, reviewer), 'cred:2026:0005');
    const decision = Buffer.from(
      '{"reason":"administrative revocation","salt":"REVOKE_SAFE_SALT"}',
    );
    ledger.transient.set('credentialDecision', decision);
    await contract.RevokeCredential(context(ledger, reviewer), 'cred:2026:0005', sha256(decision));
    const verification = JSON.parse(
      await contract.VerifyCredential(
        context(ledger, reviewer),
        'cred:2026:0005',
        sha256(gradeDetails),
      ),
    ) as { authentic: boolean; valid: boolean; status: string };
    expect(verification).toMatchObject({
      authentic: true,
      valid: false,
      status: 'REVOKED',
    });
  });

  it('provides role-scoped paginated credential queues and moves status indexes', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:list01'));
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:list02'));

    const firstPage = JSON.parse(
      await contract.ListReviewCredentials(context(ledger, reviewer), 'PENDING_REVIEW', '1', ''),
    ) as { items: CredentialRecord[]; bookmark: string };
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.bookmark).not.toBe('');
    const secondPage = JSON.parse(
      await contract.ListReviewCredentials(
        context(ledger, reviewer),
        'PENDING_REVIEW',
        '1',
        firstPage.bookmark,
      ),
    ) as { items: CredentialRecord[]; bookmark: string };
    expect(secondPage.items).toHaveLength(1);

    await contract.ApproveCredential(context(ledger, reviewer), firstPage.items[0]!.credentialId);
    const pending = JSON.parse(
      await contract.ListReviewCredentials(context(ledger, reviewer), 'PENDING_REVIEW', '10', ''),
    ) as { items: CredentialRecord[] };
    const active = JSON.parse(
      await contract.ListReviewCredentials(context(ledger, reviewer), 'ACTIVE', '10', ''),
    ) as { items: CredentialRecord[] };
    expect(pending.items).toHaveLength(1);
    expect(active.items.map((record) => record.credentialId)).toContain(
      firstPage.items[0]!.credentialId,
    );

    const student = {
      id: 'x509::student-alice',
      mspId: 'UniversityAMSP',
      role: 'student',
      subjectHash,
    } as const;
    const mine = JSON.parse(
      await contract.ListMyCredentials(context(ledger, student), '10', ''),
    ) as { items: CredentialRecord[] };
    expect(mine.items).toHaveLength(2);
    await expect(
      contract.ListMyCredentials(
        context(ledger, { ...student, subjectHash: sha256('not-alice') }),
        '10',
        '',
      ),
    ).resolves.toContain('"items":[]');
  });

  it('indexes appeals for the reviewer queue and the submitting student', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:appeal-list'));
    await contract.ApproveCredential(context(ledger, reviewer), 'cred:2026:appeal-list');
    const student = {
      id: 'x509::student-alice',
      mspId: 'UniversityAMSP',
      role: 'student',
      subjectHash,
    } as const;
    const details = Buffer.from(
      '{"reason":"Please verify the recorded laboratory score.","salt":"APPEAL_LIST_SAFE_SALT"}',
    );
    ledger.transient.set('appealDetails', details);
    await contract.SubmitAppeal(
      context(ledger, student),
      'appeal:2026:list01',
      'cred:2026:appeal-list',
      sha256(details),
    );

    const queue = JSON.parse(
      await contract.ListReviewAppeals(context(ledger, reviewer), 'OPEN', '10', ''),
    ) as { items: AppealRecord[] };
    const mine = JSON.parse(await contract.ListMyAppeals(context(ledger, student), '10', '')) as {
      items: AppealRecord[];
    };
    expect(queue.items[0]).toMatchObject({
      appealId: 'appeal:2026:list01',
      issuerMspId: 'UniversityAMSP',
    });
    expect(mine.items).toHaveLength(1);
  });

  it('creates, consumes and exhausts a subject-bound disclosure grant', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:share01'));
    await contract.ApproveCredential(context(ledger, reviewer), 'cred:2026:share01');
    const student = {
      id: 'x509::student-alice',
      mspId: 'UniversityAMSP',
      role: 'student',
      subjectHash,
    } as const;
    const access = {
      token: 'A'.repeat(43),
      purpose: 'graduate application verification',
      verifier: 'target university admissions office',
    };
    const grantInput = JSON.stringify({
      grantId: 'grant:2026:share01',
      credentialId: 'cred:2026:share01',
      tokenHash: sha256(access.token),
      purposeHash: sha256(access.purpose),
      verifierHash: sha256(access.verifier),
      selectedFields: ['courseName', 'grade'],
      expiresAt: '2026-08-25T16:00:00.000Z',
      maxUses: 2,
    });
    const created = JSON.parse(
      await contract.CreateDisclosureGrant(context(ledger, student), grantInput),
    ) as { status: string; usedCount: number; tokenHash: string };
    expect(created).toMatchObject({
      status: 'ACTIVE',
      usedCount: 0,
      tokenHash: sha256(access.token),
    });
    expect(JSON.stringify(created)).not.toContain(access.purpose);
    expect(JSON.stringify(created)).not.toContain(access.verifier);

    ledger.transient.set('disclosureAccess', Buffer.from(JSON.stringify(access)));
    const disclosed = JSON.parse(
      await contract.EvaluateDisclosureGrant(context(ledger, reviewer), 'grant:2026:share01'),
    ) as Record<string, unknown>;
    expect(disclosed).toEqual({ grade: 'A' });
    expect(disclosed).not.toHaveProperty('score');
    expect(disclosed).not.toHaveProperty('salt');
    const first = JSON.parse(
      await contract.ConsumeDisclosureGrant(context(ledger, reviewer), 'grant:2026:share01'),
    ) as { status: string; usedCount: number };
    expect(first).toMatchObject({ status: 'ACTIVE', usedCount: 1 });
    const second = JSON.parse(
      await contract.ConsumeDisclosureGrant(context(ledger, reviewer), 'grant:2026:share01'),
    ) as { status: string; usedCount: number };
    expect(second).toMatchObject({ status: 'CONSUMED', usedCount: 2 });
    await expect(
      contract.ConsumeDisclosureGrant(context(ledger, reviewer), 'grant:2026:share01'),
    ).rejects.toThrow('active disclosure');

    const mine = JSON.parse(
      await contract.ListMyDisclosureGrants(context(ledger, student), '10', ''),
    ) as { items: Array<{ grantId: string }> };
    expect(mine.items.map((grant) => grant.grantId)).toContain('grant:2026:share01');
  });

  it('rejects mismatched disclosure bindings and supports student revocation', async () => {
    await contract.CreateCredentialDraft(context(ledger, issuer), draft('cred:2026:share02'));
    await contract.ApproveCredential(context(ledger, reviewer), 'cred:2026:share02');
    const student = {
      id: 'x509::student-alice',
      mspId: 'UniversityAMSP',
      role: 'student',
      subjectHash,
    } as const;
    const token = 'B'.repeat(43);
    await contract.CreateDisclosureGrant(
      context(ledger, student),
      JSON.stringify({
        grantId: 'grant:2026:share02',
        credentialId: 'cred:2026:share02',
        tokenHash: sha256(token),
        purposeHash: sha256('scholarship verification'),
        verifierHash: sha256('scholarship committee'),
        selectedFields: ['score'],
        expiresAt: '2026-08-25T16:00:00.000Z',
        maxUses: 1,
      }),
    );
    ledger.transient.set(
      'disclosureAccess',
      Buffer.from(
        JSON.stringify({
          token,
          purpose: 'scholarship verification',
          verifier: 'wrong verifier',
        }),
      ),
    );
    await expect(
      contract.ConsumeDisclosureGrant(context(ledger, reviewer), 'grant:2026:share02'),
    ).rejects.toThrow('binding');
    const revoked = JSON.parse(
      await contract.RevokeDisclosureGrant(context(ledger, student), 'grant:2026:share02'),
    ) as { status: string };
    expect(revoked.status).toBe('REVOKED');
  });

  it('enforces disclosure field, usage and expiry bounds inside chaincode', async () => {
    const student = {
      id: 'x509::student-alice',
      mspId: 'UniversityAMSP',
      role: 'student',
      subjectHash,
    } as const;
    const base = {
      grantId: 'grant:2026:bounds01',
      credentialId: 'cred:2026:missing',
      tokenHash: sha256('token'),
      purposeHash: sha256('purpose'),
      verifierHash: sha256('verifier'),
      selectedFields: ['grade'],
      expiresAt: '2026-08-25T16:00:00.000Z',
      maxUses: 1,
    };
    await expect(
      contract.CreateDisclosureGrant(
        context(ledger, student),
        JSON.stringify({ ...base, selectedFields: ['salt'] }),
      ),
    ).rejects.toThrow('unsupported');
    await expect(
      contract.CreateDisclosureGrant(
        context(ledger, student),
        JSON.stringify({ ...base, maxUses: 11 }),
      ),
    ).rejects.toThrow('1 to 10');
    await expect(
      contract.CreateDisclosureGrant(
        context(ledger, student),
        JSON.stringify({ ...base, expiresAt: '2026-08-24T15:00:00.000Z' }),
      ),
    ).rejects.toThrow('future');
    await expect(
      contract.CreateDisclosureGrant(
        context(ledger, student),
        JSON.stringify({ ...base, expiresAt: '2026-10-24T16:00:00.000Z' }),
      ),
    ).rejects.toThrow('30 days');
  });
});
