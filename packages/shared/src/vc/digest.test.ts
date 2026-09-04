import { describe, expect, it } from 'vitest';

import { canonicalize } from './canonicalize.js';
import { sha256Hex, utf8Encode } from './digest.js';

describe('sha256Hex', () => {
  it('matches the FIPS 180-4 vector for "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches the courseHash golden vector for the course name', async () => {
    expect(await sha256Hex('区块链技术与应用')).toBe(
      '3789008875cfc5c25130d2f654ae4f271888b9e7a5f9d036d7ba346cc951188d',
    );
  });

  it('matches the detailHash golden vector for the canonical detail object', async () => {
    const detail = {
      courseName: '区块链技术与应用',
      grade: 'A',
      salt: 'CHAIN_GRADE_DEMO_2026',
      score: 92,
    };
    expect(await sha256Hex(canonicalize(detail))).toBe(
      '1b0825a03e8c0d12e90e8ea1125c8432845322c86ed561cff757d4dec5ede1d5',
    );
  });

  it('accepts a Uint8Array input directly', async () => {
    expect(await sha256Hex(Uint8Array.from([0x61, 0x62, 0x63]))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('utf8Encode', () => {
  it('encodes 1/2/3/4-byte UTF-8 sequences correctly', () => {
    expect(Array.from(utf8Encode('A'))).toEqual([0x41]);
    expect(Array.from(utf8Encode('é'))).toEqual([0xc3, 0xa9]);
    expect(Array.from(utf8Encode('中'))).toEqual([0xe4, 0xb8, 0xad]);
    expect(Array.from(utf8Encode('😀'))).toEqual([0xf0, 0x9f, 0x98, 0x80]);
  });
});
