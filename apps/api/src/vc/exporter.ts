import {
  canonicalizationUrl,
  chaincode,
  channel,
  credentialSchemaId,
  credentialSchemaType,
  evidenceType,
  issuerId,
  proofPurpose,
  proofType,
  statusType,
  subjectIdPrefix,
  vcContext,
  vcType,
} from '@chaingrade/shared';
import type {
  CredentialFile,
  CredentialSubject,
  DisclosureField,
  Evidence,
  PublicCredentialRecord,
} from '@chaingrade/shared';

import type { IssuerKeys } from './issuer-keys.js';
import { signDocument } from './signer.js';

// Builds a signed ChainGrade verifiable credential from the on-chain public record,
// the student's private details and the fields the student chose to export.
export function exportCredential(
  record: PublicCredentialRecord,
  privateDetails: Record<string, unknown>,
  selectedFields: DisclosureField[],
  keys: IssuerKeys,
): CredentialFile {
  const [contextV2, contextChainGrade] = vcContext;
  const [typeVerifiable, typeAcademic] = vcType;

  const unsigned: CredentialFile = {
    '@context': [contextV2, contextChainGrade],
    id: record.credentialId,
    type: [typeVerifiable, typeAcademic],
    issuer: { id: issuerId },
    validFrom: record.issuedAt,
    credentialSchema: {
      id: credentialSchemaId,
      type: credentialSchemaType,
      schemaVersion: record.schemaVersion,
    },
    credentialSubject: buildSubject(record, privateDetails, selectedFields),
    credentialStatus: {
      id: `urn:chaingrade:credential:${record.credentialId}#status`,
      type: statusType,
      credentialId: record.credentialId,
      statusEndpoint: `${keys.publicBaseUrl}/api/v1/credentials/${encodeURIComponent(record.credentialId)}/verify`,
    },
    evidence: buildEvidence(record),
    proof: {
      type: proofType,
      created: new Date().toISOString(),
      verificationMethod: keys.verificationMethod,
      proofPurpose,
      canonicalization: canonicalizationUrl,
      proofValue: '',
    },
  };

  const proofValue = signDocument(unsigned, keys.privateKey);
  return { ...unsigned, proof: { ...unsigned.proof, proofValue } };
}

function buildSubject(
  record: PublicCredentialRecord,
  privateDetails: Record<string, unknown>,
  selectedFields: DisclosureField[],
): CredentialSubject {
  const subject: CredentialSubject = {
    id: `${subjectIdPrefix}${record.subjectHash}`,
    subjectHash: record.subjectHash,
  };

  if (selectedFields.includes('courseName') && typeof privateDetails.courseName === 'string') {
    subject.courseName = privateDetails.courseName;
  }
  if (selectedFields.includes('score') && typeof privateDetails.score === 'number') {
    subject.score = privateDetails.score;
  }
  if (selectedFields.includes('grade') && typeof privateDetails.grade === 'string') {
    subject.grade = privateDetails.grade;
  }

  return subject;
}

function buildEvidence(record: PublicCredentialRecord): Evidence {
  const evidence: Evidence = {
    type: evidenceType,
    channel,
    chaincode,
    credentialId: record.credentialId,
    issuerMspId: record.issuerMspId,
    schemaVersion: record.schemaVersion,
    detailHash: record.detailHash,
    transactionId: record.transactionId,
    version: record.version,
  };
  if (record.previousCredentialId) {
    evidence.previousCredentialId = record.previousCredentialId;
  }
  return evidence;
}
