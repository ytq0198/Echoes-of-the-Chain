import type { KeyObject } from 'node:crypto';

import { verificationMethod } from '@chaingrade/shared';
import type { CredentialFile, CredentialStatus } from '@chaingrade/shared';

import type { CredentialLedger } from '../ledger/types.js';
import { verifyDocument } from './signer.js';

export interface SignatureResult {
  valid: boolean;
  verificationMethod: string;
}

export interface ChainStatusResult {
  credentialId: string;
  status: CredentialStatus;
  version: number;
  issuerMspId: string;
}

export interface AnchorResult {
  detailHashMatch: boolean;
  subjectHashMatch: boolean;
}

export interface VerificationResult {
  conclusion: 'valid' | 'invalid';
  signature: SignatureResult;
  chainStatus: ChainStatusResult;
  anchor: AnchorResult;
}

// Verifies a credential file in three independent segments:
//   1. signature  - the proof must reference the known verification method and
//                   verify against the trusted public key (never a key from the file);
//   2. chainStatus - the live on-chain status is queried (ACTIVE/REVOKED/SUPERSEDED);
//   3. anchor     - the evidence.detailHash and subjectHash must match the ledger.
// A credential is only "valid" when all three segments pass.
export async function verifyCredentialFile(
  file: CredentialFile,
  publicKey: KeyObject,
  ledger: CredentialLedger,
): Promise<VerificationResult> {
  const methodMatches = file.proof.verificationMethod === verificationMethod;
  const signatureValid = methodMatches && verifyDocument(file, publicKey);

  const record = await ledger.read(file.id);

  const detailHashMatch = file.evidence.detailHash === record.detailHash;
  const subjectHashMatch = file.credentialSubject.subjectHash === record.subjectHash;
  const statusActive = record.status === 'ACTIVE';

  return {
    conclusion:
      signatureValid && statusActive && detailHashMatch && subjectHashMatch ? 'valid' : 'invalid',
    signature: {
      valid: signatureValid,
      verificationMethod: file.proof.verificationMethod,
    },
    chainStatus: {
      credentialId: record.credentialId,
      status: record.status,
      version: record.version,
      issuerMspId: record.issuerMspId,
    },
    anchor: {
      detailHashMatch,
      subjectHashMatch,
    },
  };
}
