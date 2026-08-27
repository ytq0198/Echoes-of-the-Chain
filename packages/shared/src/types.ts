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

export const disclosureStatuses = ['ACTIVE', 'CONSUMED', 'REVOKED'] as const;

export type DisclosureStatus = (typeof disclosureStatuses)[number];

export const disclosureFields = ['courseName', 'score', 'grade'] as const;

export type DisclosureField = (typeof disclosureFields)[number];

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

export interface PublicDisclosureGrant {
  docType: 'gradeDisclosureGrant';
  grantId: string;
  credentialId: string;
  subjectHash: string;
  issuerMspId: string;
  tokenHash: string;
  purposeHash: string;
  verifierHash: string;
  selectedFields: DisclosureField[];
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  status: DisclosureStatus;
  createdByIdentityHash: string;
  lastConsumedByIdentityHash?: string;
  createdAt: string;
  updatedAt: string;
  transactionId: string;
}

export interface DisclosureResult {
  grant: PublicDisclosureGrant;
  disclosed: Partial<Record<DisclosureField, unknown>>;
}
