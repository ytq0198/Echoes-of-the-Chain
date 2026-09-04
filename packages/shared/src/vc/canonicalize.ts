// JCS (RFC 8785) canonical JSON serialization for the ChainGrade credential.
//
// This module is intentionally independent of `apps/api/src/lib/canonical-json.ts`,
// which uses `localeCompare` and backs the on-chain `detailHash` commitment. That
// module must never be modified. Here we implement JCS: object keys are sorted by
// Unicode code point, strings keep raw UTF-8 (no `\uXXXX` escaping for non-ASCII and
// no `/` escaping), numbers use the shortest round-trip decimal without exponent
// notation, and `-0` is normalized to `0`.

export function canonicalize(value: unknown): string {
  return serializeValue(value);
}

function serializeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return serializeString(value);
  if (typeof value === 'number') return serializeNumber(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeValue(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareStrings);
    return `{${keys.map((key) => `${serializeString(key)}:${serializeValue(record[key])}`).join(',')}}`;
  }
  throw new TypeError(`JCS cannot serialize a value of type ${typeof value}`);
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function serializeString(value: string): string {
  let output = '"';
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code === 0x22) output += '\\"';
    else if (code === 0x5c) output += '\\\\';
    else if (code === 0x08) output += '\\b';
    else if (code === 0x09) output += '\\t';
    else if (code === 0x0a) output += '\\n';
    else if (code === 0x0c) output += '\\f';
    else if (code === 0x0d) output += '\\r';
    else if (code < 0x20) output += `\\u${code.toString(16).padStart(4, '0')}`;
    else output += character;
  }
  return `${output}"`;
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError('JCS cannot serialize NaN or Infinity');
  }
  if (Object.is(value, -0)) return '0';
  const text = value.toString();
  const exponentIndex = text.indexOf('e');
  if (exponentIndex === -1) return text;
  return expandExponent(text, exponentIndex);
}

function expandExponent(text: string, exponentIndex: number): string {
  const mantissa = text.slice(0, exponentIndex);
  const exponent = Number(text.slice(exponentIndex + 1));
  const negative = mantissa.startsWith('-');
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const dotIndex = unsigned.indexOf('.');
  const digits = unsigned.replace('.', '');
  const pointPosition = dotIndex === -1 ? digits.length : dotIndex;
  const target = pointPosition + exponent;
  let result: string;
  if (target <= 0) {
    result = `0.${'0'.repeat(-target)}${digits}`;
  } else if (target >= digits.length) {
    result = digits + '0'.repeat(target - digits.length);
  } else {
    result = `${digits.slice(0, target)}.${digits.slice(target)}`;
  }
  if (result.includes('.')) {
    result = result.replace(/0+$/, '').replace(/\.$/, '');
  }
  return negative ? `-${result}` : result;
}
