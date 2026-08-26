export const credentialStatuses = [
  'PENDING_REVIEW',
  'ACTIVE',
  'REJECTED',
  'SUPERSEDED',
  'REVOKED',
] as const;

export type CredentialStatus = (typeof credentialStatuses)[number];

export const appealStatuses = ['OPEN', 'RESOLVED_ACCEPTED', 'RESOLVED_REJECTED'] as const;

export type AppealStatus = (typeof appealStatuses)[number];

export interface LedgerPage<T> {
  items: T[];
  bookmark: string;
  fetchedRecordsCount: number;
}

export interface PublicCredentialRecord {
  docType: 'gradeCredential';
  credentialId: string;
  subjectHash: string;
  courseHash: string;
  detailHash: string;
  issuerMspId: string;
  schemaVersion: string;
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

export interface PublicAppealRecord {
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
