import { sign, verify, type KeyObject } from 'node:crypto';

import { canonicalize } from '@chaingrade/shared';
import type { CredentialFile } from '@chaingrade/shared';

type ProofWithoutValue = Omit<CredentialFile['proof'], 'proofValue'>;

// The bytes that are actually signed: the JCS canonical form of the document with
// `proof.proofValue` removed. Any change to a protected field therefore invalidates
// the signature, while the signature value itself stays outside the signed payload.
export function signingInput(document: CredentialFile): string {
  return canonicalize(stripProofValue(document));
}

export function signDocument(document: CredentialFile, privateKey: KeyObject): string {
  const signature = sign(null, Buffer.from(signingInput(document), 'utf8'), privateKey);
  return signature.toString('hex');
}

export function verifyDocument(document: CredentialFile, publicKey: KeyObject): boolean {
  const signature = Buffer.from(document.proof.proofValue, 'hex');
  return verify(null, Buffer.from(signingInput(document), 'utf8'), publicKey, signature);
}

function stripProofValue(
  document: CredentialFile,
): Omit<CredentialFile, 'proof'> & { proof: ProofWithoutValue } {
  const { proofValue: _proofValue, ...proofWithoutValue } = document.proof;
  return { ...document, proof: proofWithoutValue };
}
