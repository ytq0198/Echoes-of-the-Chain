import { describe, expect, it } from 'vitest';

import { exportCredential } from './exporter.js';
import { generateEd25519KeyPair, loadIssuerKeys } from './issuer-keys.js';
import { verifyCredentialFile } from './verifier.js';

const hash64 = 'a'.repeat(64);
const otherHash = 'b'.repeat(64);

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
  return loadIssuerKeys({
    VC_ISSUER_PRIVATE_KEY: privateKeyPem,
    VC_ISSUER_PUBLIC_KEY: publicKeyPem,
    VC_PUBLIC_BASE_URL: 'https://credentials.example.edu',
  });
}

function makeLedger(record: Record<string, unknown>) {
  return {
    async read(_credentialId: string) {
      return record;
    },
  };
}

describe('verifyCredentialFile', () => {
  it('returns valid for an active, unmodified, correctly anchored credential', async () => {
    const keys = makeKeys();
    const record = makeRecord();
    const credential = exportCredential(
      record,
      privateDetails,
      ['courseName', 'score', 'grade'],
      keys,
    );

    const result = await verifyCredentialFile(credential, keys.publicKey, makeLedger(record));

    expect(result.conclusion).toBe('valid');
    expect(result.signature.valid).toBe(true);
    expect(result.chainStatus.status).toBe('ACTIVE');
    expect(result.anchor.detailHashMatch).toBe(true);
    expect(result.anchor.subjectHashMatch).toBe(true);
  });

  it('rejects a tampered protected field', async () => {
    const keys = makeKeys();
    const record = makeRecord();
    const credential = exportCredential(record, privateDetails, ['courseName'], keys);
    const tampered = {
      ...credential,
      credentialSubject: { ...credential.credentialSubject, courseName: '被篡改的课程' },
    };

    const result = await verifyCredentialFile(tampered, keys.publicKey, makeLedger(record));

    expect(result.signature.valid).toBe(false);
    expect(result.conclusion).toBe('invalid');
  });

  it('keeps the signature valid but concludes invalid for a REVOKED credential', async () => {
    const keys = makeKeys();
    const record = makeRecord({ status: 'REVOKED' });
    const credential = exportCredential(record, privateDetails, ['courseName'], keys);

    const result = await verifyCredentialFile(credential, keys.publicKey, makeLedger(record));

    expect(result.signature.valid).toBe(true);
    expect(result.chainStatus.status).toBe('REVOKED');
    expect(result.conclusion).toBe('invalid');
  });

  it('concludes invalid for a SUPERSEDED credential', async () => {
    const keys = makeKeys();
    const record = makeRecord({
      status: 'SUPERSEDED',
      version: 2,
      previousCredentialId: 'cred:2026:demo00',
    });
    const credential = exportCredential(record, privateDetails, ['courseName'], keys);

    const result = await verifyCredentialFile(credential, keys.publicKey, makeLedger(record));

    expect(result.signature.valid).toBe(true);
    expect(result.chainStatus.status).toBe('SUPERSEDED');
    expect(result.chainStatus.version).toBe(2);
    expect(result.conclusion).toBe('invalid');
  });

  it('flags a detailHash anchor mismatch while the signature stays valid', async () => {
    const keys = makeKeys();
    const record = makeRecord();
    const credential = exportCredential(record, privateDetails, ['courseName'], keys);
    const divergentRecord = makeRecord({ detailHash: otherHash });

    const result = await verifyCredentialFile(
      credential,
      keys.publicKey,
      makeLedger(divergentRecord),
    );

    expect(result.signature.valid).toBe(true);
    expect(result.anchor.detailHashMatch).toBe(false);
    expect(result.anchor.subjectHashMatch).toBe(true);
    expect(result.conclusion).toBe('invalid');
  });

  it('flags a subjectHash anchor mismatch', async () => {
    const keys = makeKeys();
    const record = makeRecord();
    const credential = exportCredential(record, privateDetails, ['courseName'], keys);
    const divergentRecord = makeRecord({ subjectHash: otherHash });

    const result = await verifyCredentialFile(
      credential,
      keys.publicKey,
      makeLedger(divergentRecord),
    );

    expect(result.anchor.subjectHashMatch).toBe(false);
    expect(result.conclusion).toBe('invalid');
  });

  it('rejects an unknown verification method', async () => {
    const keys = makeKeys();
    const record = makeRecord();
    const credential = exportCredential(record, privateDetails, ['courseName'], keys);
    const tampered = {
      ...credential,
      proof: { ...credential.proof, verificationMethod: 'did:example:unknown#key-1' },
    };

    const result = await verifyCredentialFile(tampered, keys.publicKey, makeLedger(record));

    expect(result.signature.valid).toBe(false);
    expect(result.conclusion).toBe('invalid');
  });

  it('rejects a wrong public key', async () => {
    const keys = makeKeys();
    const otherKeys = makeKeys();
    const record = makeRecord();
    const credential = exportCredential(record, privateDetails, ['courseName'], keys);

    const result = await verifyCredentialFile(credential, otherKeys.publicKey, makeLedger(record));

    expect(result.signature.valid).toBe(false);
    expect(result.conclusion).toBe('invalid');
  });
});
