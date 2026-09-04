// Shared constants for the ChainGrade verifiable credential (VC 2.0 style) profile.
//
// These values are the single source of truth for the Q1 design and are reused by
// the Zod schemas (schema.ts, added in a later task) and by the API export/verify
// services (work package A, Q3/Q4).

export const vcProfileVersion = '1.0' as const;

export const vcContext = [
  'https://www.w3.org/ns/credentials/v2',
  'https://chaingrade.example/contexts/grade-credential/v1',
] as const;

export const vcType = ['VerifiableCredential', 'ChainGradeAcademicCredential'] as const;

export const issuerId = 'did:example:chaingrade-issuer' as const;

export const verificationMethod = 'did:example:chaingrade-issuer#key-1' as const;

export const proofType = 'ChainGradeEd25519Signature2026' as const;

export const proofPurpose = 'assertionMethod' as const;

export const canonicalizationUrl = 'https://www.rfc-editor.org/rfc/rfc8785' as const;

export const statusType = 'ChainGradeFabricStatusV1' as const;

export const evidenceType = 'ChainGradeFabricAnchorV1' as const;

export const credentialSchemaId = 'https://chaingrade.example/schema/grade-credential/v1' as const;

export const credentialSchemaType = 'JsonSchema' as const;

export const subjectIdPrefix = 'did:example:chaingrade-subject:' as const;

export const channel = 'chaingrade' as const;

export const chaincode = 'grade' as const;
