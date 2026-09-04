// Cross-environment SHA-256 digest helpers for the ChainGrade credential.
//
// This module uses the Web Crypto API (`crypto.subtle`), which is available natively
// in both Node.js (>= 18) and browsers, so the same code produces identical hashes on
// both ends. It has no dependency on Node-only globals (`node:crypto`, `Buffer`),
// keeping the shared package browser-safe.

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? utf8Encode(input) : input;
  const digest = await getSubtle().digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function utf8Encode(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

interface SubtleDigest {
  digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
}

interface CryptoWithSubtle {
  subtle: SubtleDigest;
}

function getSubtle(): SubtleDigest {
  const cryptoApi = (globalThis as { crypto?: CryptoWithSubtle }).crypto;
  if (!cryptoApi?.subtle) {
    throw new Error('Web Crypto `crypto.subtle.digest` is unavailable in this environment');
  }
  return cryptoApi.subtle;
}
