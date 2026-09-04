import { credentialFileSchema } from '@chaingrade/shared';

import { describe, expect, it } from 'vitest';

import { exportCredential } from './exporter.js';
import { generateEd25519KeyPair, loadIssuerKeys } from './issuer-keys.js';
import { verifyDocument } from './signer.js';

const hash64 = 'a'.repeat(64);

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    docType: 'gradeCredential',
    credentialId: 'cred:2026:demo01',
    subjectHash: hash64,
    courseHash: 'c'.repeat(64),
    detailHash: hash64,
    issuerMspId: 'Org1MSP',
    schemaVersion: '1.0',
    status: 'ACTIVE',
    version: 1,
    submittedByIdentityHash: hash64,
    reviewedByIdentityHash: hash64,
    issuedAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    transactionId: 'txid-0001',
    ...overrides,
  };
}

const privateDetails = {
  courseName: '区块链技术与应用',
  score: 92,
  grade: 'A',
  salt: 'CHAIN_GRADE_DEMO_2026',
};

function makeKeys() {
  const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
  return loadIssuerKeys({ VC_ISSUER_PRIVATE_KEY: privateKeyPem, VC_ISSUER_PUBLIC_KEY: publicKeyPem });
}

describe('exportCredential', () => {
  it('produces a schema-valid, verifiable credential', () => {
    const keys = makeKeys();
    const credential = exportCredential(
      makeRecord(),
      privateDetails,
      ['courseName', 'score', 'grade'],
      keys,
    );

    expect(credentialFileSchema.parse(credential)).toBeDefined();
    expect(credential.proof.proofValue).toMatch(/^[a-f0-9]{128}$/);
    expect(verifyDocument(credential, keys.publicKey)).toBe(true);
  });

  it('only includes the selected fields in credentialSubject', () => {
    const keys = makeKeys();
    const credential = exportCredential(makeRecord(), privateDetails, ['score'], keys);

    expect(credential.credentialSubject.score).toBe(92);
    expect(credential.credentialSubject.courseName).toBeUndefined();
    expect(credential.credentialSubject.grade).toBeUndefined();
  });

  it('maps evidence fields from the record, including previousCredentialId', () => {
    const keys = makeKeys();
    const record = makeRecord({ version: 2, previousCredentialId: 'cred:2026:demo00' });
    const credential = exportCredential(record, privateDetails, ['courseName'], keys);

    expect(credential.evidence).toMatchObject({
      type: 'ChainGradeFabricAnchorV1',
      channel: 'chaingrade',
      chaincode: 'grade',
      credentialId: 'cred:2026:demo01',
      issuerMspId: 'Org1MSP',
      detailHash: hash64,
      version: 2,
      previousCredentialId: 'cred:2026:demo00',
    });
  });

  it('sets credentialStatus as a query pointer without embedding the status', () => {
    const keys = makeKeys();
    const credential = exportCredential(makeRecord(), privateDetails, ['grade'], keys);

    expect(credential.credentialStatus).toMatchObject({
      type: 'ChainGradeFabricStatusV1',
      credentialId: 'cred:2026:demo01',
    });
    expect(credential.credentialStatus.id).toContain('cred:2026:demo01');
    expect(credential.credentialStatus.statusEndpoint).toContain('cred:2026:demo01/verify');
  });
});
