import { describe, expect, it } from 'vitest';

import { canonicalJson } from './canonical-json.js';

describe('canonicalJson', () => {
  it('sorts nested object keys while preserving array order', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 }, list: [{ z: 4, a: 5 }] })).toBe(
      '{"a":{"b":3,"y":2},"list":[{"a":5,"z":4}],"z":1}',
    );
  });
});

