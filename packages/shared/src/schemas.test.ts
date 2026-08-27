import { describe, expect, it } from 'vitest';

import {
  consumeDisclosureRequestSchema,
  createDisclosureRequestSchema,
  credentialDraftSchema,
  gradeBatchImportRequestSchema,
} from './schemas.js';
import { gradeCsvHeader, parseGradeCsv, validateGradeCsvRows } from './grade-csv.js';

const hash = 'a'.repeat(64);

describe('credentialDraftSchema', () => {
  it('accepts a minimal privacy-preserving public draft', () => {
    expect(
      credentialDraftSchema.parse({
        credentialId: 'cred:2026:0001',
        subjectHash: hash,
        courseHash: hash,
        detailHash: hash,
        schemaVersion: '1.0',
      }),
    ).toBeDefined();
  });

  it('rejects a plaintext student number in place of a hash', () => {
    expect(() =>
      credentialDraftSchema.parse({
        credentialId: 'cred:2026:0001',
        subjectHash: 'student-123',
        courseHash: hash,
        detailHash: hash,
        schemaVersion: '1.0',
      }),
    ).toThrow();
  });
});

describe('disclosure request schemas', () => {
  it('accepts a bounded field disclosure grant', () => {
    expect(
      createDisclosureRequestSchema.parse({
        grantId: 'grant:2026:0001',
        selectedFields: ['courseName', 'grade'],
        purpose: '研究生申请材料核验',
        verifier: '目标院校招生办公室',
        expiresAt: '2026-08-28T12:00:00.000Z',
        maxUses: 2,
      }),
    ).toMatchObject({ selectedFields: ['courseName', 'grade'], maxUses: 2 });
  });

  it('rejects secret fields, duplicate fields and weak consume inputs', () => {
    expect(() =>
      createDisclosureRequestSchema.parse({
        grantId: 'grant:2026:0001',
        selectedFields: ['salt'],
        purpose: '研究生申请材料核验',
        verifier: '目标院校招生办公室',
        expiresAt: '2026-08-28T12:00:00.000Z',
        maxUses: 1,
      }),
    ).toThrow();
    expect(() =>
      createDisclosureRequestSchema.parse({
        grantId: 'grant:2026:0001',
        selectedFields: ['grade', 'grade'],
        purpose: '研究生申请材料核验',
        verifier: '目标院校招生办公室',
        expiresAt: '2026-08-28T12:00:00.000Z',
        maxUses: 1,
      }),
    ).toThrow();
    expect(() =>
      consumeDisclosureRequestSchema.parse({
        token: 'short',
        purpose: '研究生申请材料核验',
        verifier: '目标院校招生办公室',
      }),
    ).toThrow();
  });
});

describe('grade CSV batch import', () => {
  it('parses BOM, CRLF and quoted commas before validating the batch', () => {
    const csv = `\uFEFF${gradeCsvHeader}\r\ncred:2026:csv01,${hash},${hash},"区块链技术,与应用",92,A,1.0,CSV_PRIVATE_SALT_0001\r\n`;
    const rows = parseGradeCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ courseName: '区块链技术,与应用', score: 92, grade: 'A' });
    expect(validateGradeCsvRows(rows)).toEqual([]);
    expect(
      gradeBatchImportRequestSchema.parse({
        rows: rows.map((row) => ({
          credentialId: row.credentialId,
          subjectHash: row.subjectHash,
          courseHash: row.courseHash,
          schemaVersion: row.schemaVersion,
          details: {
            courseName: row.courseName,
            score: row.score,
            grade: row.grade,
            salt: row.salt,
          },
        })),
      }).rows,
    ).toHaveLength(1);
  });

  it('rejects the wrong header, malformed score and duplicate credential ids', () => {
    expect(() => parseGradeCsv(`credentialId,score\ncred:2026:csv01,92`)).toThrow('表头');
    expect(() =>
      parseGradeCsv(
        `${gradeCsvHeader}\ncred:2026:csv01,${hash},${hash},课程,not-a-number,A,1.0,CSV_PRIVATE_SALT_0001`,
      ),
    ).toThrow('score');
    const row = {
      credentialId: 'cred:2026:csv01',
      subjectHash: hash,
      courseHash: hash,
      schemaVersion: '1.0',
      details: {
        courseName: '区块链技术与应用',
        score: 92,
        grade: 'A',
        salt: 'CSV_PRIVATE_SALT_0001',
      },
    };
    expect(() => gradeBatchImportRequestSchema.parse({ rows: [row, row] })).toThrow('unique');
    expect(
      validateGradeCsvRows([
        {
          credentialId: 'bad',
          subjectHash: hash,
          courseHash: hash,
          courseName: '课程',
          score: 101,
          grade: 'A',
          schemaVersion: '1',
          salt: 'short',
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('credentialId'),
        expect.stringContaining('score'),
        expect.stringContaining('schemaVersion'),
        expect.stringContaining('salt'),
      ]),
    );
  });
});
