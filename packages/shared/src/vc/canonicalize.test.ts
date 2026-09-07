import { describe, expect, it } from 'vitest';

import { canonicalize } from './canonicalize.js';

describe('canonicalize (JCS)', () => {
  it('produces the fixed canonical bytes for the grade detail object', () => {
    const detail = {
      courseName: '区块链技术与应用',
      grade: 'A',
      salt: 'CHAIN_GRADE_DEMO_2026',
      score: 92,
    };
    expect(canonicalize(detail)).toBe(
      '{"courseName":"区块链技术与应用","grade":"A","salt":"CHAIN_GRADE_DEMO_2026","score":92}',
    );
  });

  it('is invariant to object key insertion order', () => {
    const first = { b: 1, a: 2, c: 3 };
    const second = { c: 3, a: 2, b: 1 };
    expect(canonicalize(first)).toBe(canonicalize(second));
    expect(canonicalize(first)).toBe('{"a":2,"b":1,"c":3}');
  });

  it('sorts nested object keys recursively and preserves array order', () => {
    expect(canonicalize({ z: { y: 1, x: 2 }, a: [3, 2, 1] })).toBe(
      '{"a":[3,2,1],"z":{"x":2,"y":1}}',
    );
  });

  it('uses the RFC 8785 ECMAScript number representation and normalizes -0', () => {
    expect(canonicalize({ n: 92 })).toBe('{"n":92}');
    expect(canonicalize({ n: 92.5 })).toBe('{"n":92.5}');
    expect(canonicalize({ n: -0 })).toBe('{"n":0}');
    expect(canonicalize({ n: 1e21 })).toBe('{"n":1e+21}');
    expect(canonicalize({ n: 1e30 })).toBe('{"n":1e+30}');
    expect(canonicalize({ n: 1e-27 })).toBe('{"n":1e-27}');
    expect(canonicalize({ n: 0.000001 })).toBe('{"n":0.000001}');
  });

  it('escapes only JSON control characters, keeping raw UTF-8 and slashes', () => {
    expect(canonicalize({ s: 'a"b\\c' })).toBe('{"s":"a\\"b\\\\c"}');
    expect(canonicalize({ s: '中文/斜杠' })).toBe('{"s":"中文/斜杠"}');
    expect(canonicalize({ s: '\n\t' })).toBe('{"s":"\\n\\t"}');
  });

  it('handles null, booleans and empty structures', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize({})).toBe('{}');
    expect(canonicalize([])).toBe('[]');
    expect(canonicalize([1, null, 'x'])).toBe('[1,null,"x"]');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalize({ n: Number.NaN })).toThrow();
    expect(() => canonicalize({ n: Number.POSITIVE_INFINITY })).toThrow();
  });

  it('rejects lone Unicode surrogates required to be rejected by I-JSON', () => {
    expect(() => canonicalize({ value: '\ud800' })).toThrow('lone surrogate');
    expect(() => canonicalize({ value: '\udc00' })).toThrow('lone surrogate');
  });
});
