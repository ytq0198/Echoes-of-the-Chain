import { z } from 'zod';

import { identifierSchema, sha256Schema } from '../schemas.js';
import { disclosureFields } from '../types.js';
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
  vcContext,
  vcType,
  verificationMethod,
} from './types.js';

const schemaVersionPattern = /^\d+\.\d+$/;

export const courseNameSchema = z.string().trim().min(1).max(200);

export const scoreSchema = z.number().min(0).max(100);

export const gradeSchema = z.string().trim().min(1).max(16);

export const selectedFieldsSchema = z
  .array(z.enum(disclosureFields))
  .min(1)
  .max(disclosureFields.length)
  .refine((fields) => new Set(fields).size === fields.length, {
    message: 'selected fields must be unique',
  });

export const credentialSubjectSchema = z
  .object({
    id: z.string().regex(/^did:example:chaingrade-subject:[a-f0-9]{64}$/),
    subjectHash: sha256Schema,
    courseName: courseNameSchema.optional(),
    score: scoreSchema.optional(),
    grade: gradeSchema.optional(),
  })
  .refine(
    (subject) =>
      subject.courseName !== undefined || subject.score !== undefined || subject.grade !== undefined,
    { message: 'credentialSubject must include at least one of courseName, score or grade' },
  );

export const issuerSchema = z.object({
  id: z.literal(issuerId),
});

export const credentialStatusSchema = z.object({
  id: z.string().min(1),
  type: z.literal(statusType),
  credentialId: identifierSchema,
  statusEndpoint: z.string().min(1),
});

export const evidenceSchema = z.object({
  type: z.literal(evidenceType),
  channel: z.literal(channel),
  chaincode: z.literal(chaincode),
  credentialId: identifierSchema,
  issuerMspId: z.string().min(1),
  schemaVersion: z.string().regex(schemaVersionPattern),
  detailHash: sha256Schema,
  transactionId: z.string().min(1),
  version: z.number().int().min(1),
  previousCredentialId: identifierSchema.optional(),
});

export const proofSchema = z.object({
  type: z.literal(proofType),
  created: z.iso.datetime({ offset: true }),
  verificationMethod: z.literal(verificationMethod),
  proofPurpose: z.literal(proofPurpose),
  canonicalization: z.literal(canonicalizationUrl),
  proofValue: z.string().regex(/^[a-f0-9]{128}$/),
});

export const credentialFileSchema = z.object({
  '@context': z.tuple([z.literal(vcContext[0]), z.literal(vcContext[1])]),
  id: identifierSchema,
  type: z.tuple([z.literal(vcType[0]), z.literal(vcType[1])]),
  issuer: issuerSchema,
  validFrom: z.iso.datetime({ offset: true }),
  credentialSchema: z.object({
    id: z.literal(credentialSchemaId),
    type: z.literal(credentialSchemaType),
    schemaVersion: z.string().regex(schemaVersionPattern),
  }),
  credentialSubject: credentialSubjectSchema,
  credentialStatus: credentialStatusSchema,
  evidence: evidenceSchema,
  proof: proofSchema,
});

export type CredentialFile = z.infer<typeof credentialFileSchema>;
export type CredentialSubject = z.infer<typeof credentialSubjectSchema>;
export type CredentialStatusEntry = z.infer<typeof credentialStatusSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Proof = z.infer<typeof proofSchema>;
