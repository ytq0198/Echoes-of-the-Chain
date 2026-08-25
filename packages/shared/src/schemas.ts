import { z } from 'zod';

export const identifierSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/, 'must contain only letters, numbers, colon, underscore or dash');

export const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'must be a lowercase SHA-256 hex digest');

export const credentialDraftSchema = z.object({
  credentialId: identifierSchema,
  subjectHash: sha256Schema,
  courseHash: sha256Schema,
  detailHash: sha256Schema,
  schemaVersion: z.string().min(1).max(32),
});

export const credentialVerificationSchema = z.object({
  credentialId: identifierSchema,
  expectedDetailHash: sha256Schema.optional(),
});

export const appealSubmissionSchema = z.object({
  appealId: identifierSchema,
  credentialId: identifierSchema,
  reasonHash: sha256Schema,
});

export const gradeDetailsSchema = z
  .object({
    salt: z.string().min(16).max(256),
  })
  .catchall(z.unknown());

export const createCredentialRequestSchema = z.object({
  credentialId: identifierSchema,
  subjectHash: sha256Schema,
  courseHash: sha256Schema,
  schemaVersion: z.string().regex(/^\d+\.\d+$/),
  details: gradeDetailsSchema,
});
