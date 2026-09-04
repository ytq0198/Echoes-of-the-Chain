import type { KeyObject } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { generateEd25519KeyPair, privateKeyFromPem, publicKeyFromPem } from './issuer-keys.js';
import { signDocument, signingInput, verifyDocument } from './signer.js';

const hash64 = 'a'.repeat(64);

function makeDocument() {
  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://chaingrade.example/contexts/grade-credential/v1',
    ],
    id: 'cred:2026:demo01',
    type: ['VerifiableCredential', 'ChainGradeAcademicCredential'],
    issuer: { id: 'did:example:chaingrade-issuer' },
    validFrom: '2026-09-01T00:00:00.000Z',
    credentialSchema: {
      id: 'https://chaingrade.example/schema/grade-credential/v1',
      type: 'JsonSchema',
      schemaVersion: '1.0',
    },
    credentialSubject: {
      id: `did:example:chaingrade-subject:${hash64}`,
      subjectHash: hash64,
      courseName: '区块链技术与应用',
      score: 92,
      grade: 'A',
    },
    credentialStatus: {
      id: 'urn:chaingrade:credential:cred:2026:demo01#status',
      type: 'ChainGradeFabricStatusV1',
      credentialId: 'cred:2026:demo01',
      statusEndpoint: 'https://chaingrade.example/api/v1/credentials/cred:2026:demo01/verify',
    },
    evidence: {
      type: 'ChainGradeFabricAnchorV1',
      channel: 'chaingrade',
      chaincode: 'grade',
      credentialId: 'cred:2026:demo01',
      issuerMspId: 'Org1MSP',
      schemaVersion: '1.0',
      detailHash: hash64,
      transactionId: 'txid-0001',
      version: 1,
    },
    proof: {
      type: 'ChainGradeEd25519Signature2026',
      created: '2026-09-02T12:00:00.000Z',
      verificationMethod: 'did:example:chaingrade-issuer#key-1',
      proofPurpose: 'assertionMethod',
      canonicalization: 'https://www.rfc-editor.org/rfc/rfc8785',
      proofValue: '0'.repeat(128),
    },
  };
}

function makeSigner() {
  const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
  return {
    privateKey: privateKeyFromPem(privateKeyPem),
    publicKey: publicKeyFromPem(publicKeyPem),
  };
}

function signAndFill(document: ReturnType<typeof makeDocument>, privateKey: KeyObject) {
  const signature = signDocument(document, privateKey);
  return { ...document, proof: { ...document.proof, proofValue: signature } };
}

describe('signDocument / verifyDocument', () => {
  it('signs and verifies a round trip', () => {
    const { privateKey, publicKey } = makeSigner();
    const document = makeDocument();

    const signature = signDocument(document, privateKey);
    expect(signature).toMatch(/^[a-f0-9]{128}$/);

    const signed = signAndFill(document, privateKey);
    expect(verifyDocument(signed, publicKey)).toBe(true);
  });

  it('rejects a tampered courseName', () => {
    const { privateKey, publicKey } = makeSigner();
    const signed = signAndFill(makeDocument(), privateKey);
    const tampered = {
      ...signed,
      credentialSubject: { ...signed.credentialSubject, courseName: '被篡改的课程' },
    };
    expect(verifyDocument(tampered, publicKey)).toBe(false);
  });

  it('rejects a tampered score', () => {
    const { privateKey, publicKey } = makeSigner();
    const signed = signAndFill(makeDocument(), privateKey);
    const tampered = {
      ...signed,
      credentialSubject: { ...signed.credentialSubject, score: 60 },
    };
    expect(verifyDocument(tampered, publicKey)).toBe(false);
  });

  it('rejects a tampered evidence detailHash', () => {
    const { privateKey, publicKey } = makeSigner();
    const signed = signAndFill(makeDocument(), privateKey);
    const tampered = {
      ...signed,
      evidence: { ...signed.evidence, detailHash: 'b'.repeat(64) },
    };
    expect(verifyDocument(tampered, publicKey)).toBe(false);
  });

  it('rejects a mismatched public key', () => {
    const { privateKey } = makeSigner();
    const { publicKey: otherPublicKey } = makeSigner();
    const signed = signAndFill(makeDocument(), privateKey);
    expect(verifyDocument(signed, otherPublicKey)).toBe(false);
  });
});

describe('signingInput', () => {
  it('excludes proof.proofValue from the signed bytes', () => {
    const input = signingInput(makeDocument());
    expect(input).not.toContain('proofValue');
    expect(input).toContain('"proof"');
  });
});
