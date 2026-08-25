import { AcademicRecordError } from './errors';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function assertIdentifier(value: string, fieldName: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new AcademicRecordError(
      'INVALID_ARGUMENT',
      `${fieldName} must be 8-128 safe identifier characters`,
    );
  }
}

export function assertSha256(value: string, fieldName: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new AcademicRecordError(
      'INVALID_ARGUMENT',
      `${fieldName} must be a lowercase SHA-256 hex digest`,
    );
  }
}

export function parseJsonObject<T>(value: string, label: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AcademicRecordError('INVALID_JSON', `${label} is not valid JSON`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AcademicRecordError('INVALID_JSON', `${label} must be a JSON object`);
  }
  return parsed as T;
}
