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
      getTransient: () => ledger.transient,
      putPrivateData: async (collection: string, key: string, value: Uint8Array) => {
        ledger.privateState.set(`${collection}:${key}`, Buffer.from(value));
      },
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
    const reasonHash = sha256('source document requires correction');
    const rejected = JSON.parse(
      await contract.RejectCredential(context(ledger, reviewer), 'cred:2026:reject1', reasonHash),
    ) as CredentialRecord;
    expect(rejected).toMatchObject({ status: 'REJECTED', reasonHash });
    expect(JSON.stringify(rejected)).not.toContain('source document requires correction');
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

    const resolved = JSON.parse(
      await contract.ReviewAppeal(
        context(ledger, reviewer),
        submitted.appealId,
        'ACCEPTED',
        sha256('resolution accepted'),
      ),
    ) as AppealRecord;
    expect(resolved.status).toBe('RESOLVED_ACCEPTED');
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
    await contract.RevokeCredential(
      context(ledger, reviewer),
      'cred:2026:0005',
      sha256('administrative revocation'),
    );
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
});
