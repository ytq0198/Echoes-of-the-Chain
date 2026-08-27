export type CredentialStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'SUPERSEDED' | 'REVOKED';

export type AppealDecision = 'ACCEPTED' | 'REJECTED';

export type AppealStatus = 'OPEN' | 'RESOLVED_ACCEPTED' | 'RESOLVED_REJECTED';

export interface CredentialDraftInput {
  credentialId: string;
  subjectHash: string;
  courseHash: string;
  detailHash: string;
  schemaVersion: string;
}

export interface CredentialBatchInput {
  drafts: CredentialDraftInput[];
}

export interface CredentialRecord extends CredentialDraftInput {
  docType: 'gradeCredential';
  issuerMspId: string;
  status: CredentialStatus;
  version: number;
  previousCredentialId?: string;
  submittedByIdentityHash: string;
  reviewedByIdentityHash?: string;
  issuedAt: string;
  updatedAt: string;
  transactionId: string;
  reasonHash?: string;
}

export interface AppealRecord {
  docType: 'gradeAppeal';
  appealId: string;
  credentialId: string;
  subjectHash: string;
  issuerMspId: string;
  reasonHash: string;
  status: AppealStatus;
  submittedAt: string;
  updatedAt: string;
  submittedByIdentityHash: string;
  reviewedByIdentityHash?: string;
  resolutionHash?: string;
  transactionId: string;
}

export interface LedgerPage<T> {
  items: T[];
  bookmark: string;
  fetchedRecordsCount: number;
}

export type DisclosureStatus = 'ACTIVE' | 'CONSUMED' | 'REVOKED';

export type DisclosureField = 'courseName' | 'score' | 'grade';

export interface DisclosureGrantInput {
  grantId: string;
  credentialId: string;
  tokenHash: string;
  purposeHash: string;
  verifierHash: string;
  selectedFields: DisclosureField[];
  expiresAt: string;
  maxUses: number;
}

export interface DisclosureGrantRecord extends DisclosureGrantInput {
  docType: 'gradeDisclosureGrant';
  subjectHash: string;
  issuerMspId: string;
  usedCount: number;
  status: DisclosureStatus;
  createdByIdentityHash: string;
  lastConsumedByIdentityHash?: string;
  createdAt: string;
  updatedAt: string;
  transactionId: string;
}
