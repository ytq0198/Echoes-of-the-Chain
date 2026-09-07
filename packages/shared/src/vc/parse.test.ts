import { describe, expect, it } from 'vitest';

import { parseStrictJson } from './parse.js';

describe('parseStrictJson', () => {
  it('parses valid JSON including nested structures and unicode', () => {
    expect(parseStrictJson('{"a":1,"b":[true,null,"中文"],"c":{"d":2.5}}')).toEqual({
      a: 1,
      b: [true, null, '中文'],
      c: { d: 2.5 },
    });
  });

  it('decodes string escape sequences', () => {
    expect(parseStrictJson('"\\u4e2d\\u6587"')).toBe('中文');
    expect(parseStrictJson('"a\\nb\\t"')).toBe('a\nb\t');
  });

  it('rejects duplicate object keys', () => {
    expect(() => parseStrictJson('{"a":1,"a":2}')).toThrow('Duplicate key');
  });

  it('rejects trailing content after the JSON value', () => {
    expect(() => parseStrictJson('{"a":1} extra')).toThrow('Trailing content');
    expect(() => parseStrictJson('{"a":1}{"b":2}')).toThrow('Trailing content');
  });

  it('rejects NaN and out-of-range numbers', () => {
    expect(() => parseStrictJson('NaN')).toThrow();
    expect(() => parseStrictJson('1e999')).toThrow('out of range');
  });

  it('rejects leading zeros and malformed numbers', () => {
    expect(() => parseStrictJson('{"a":01}')).toThrow('Leading zero');
    expect(() => parseStrictJson('{"a":1.}')).toThrow('Invalid fraction');
  });

  it('rejects unclosed structures and invalid escapes', () => {
    expect(() => parseStrictJson('{"a":1')).toThrow();
    expect(() => parseStrictJson('[1,2')).toThrow();
    expect(() => parseStrictJson('"\\x"')).toThrow('Invalid escape');
  });
});
