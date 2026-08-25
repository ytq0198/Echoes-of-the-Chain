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
  reasonHash: string;
  status: AppealStatus;
  submittedAt: string;
  updatedAt: string;
  submittedByIdentityHash: string;
  reviewedByIdentityHash?: string;
  resolutionHash?: string;
  transactionId: string;
}
