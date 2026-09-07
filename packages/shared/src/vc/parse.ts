// Strict JSON parsing with duplicate-key rejection.
//
// `JSON.parse` silently keeps the last value for duplicate object keys, which is
// unacceptable for credential verification (work package A negative test: "duplicate
// keys"). This minimal recursive-descent parser rejects duplicate keys, trailing
// content, `NaN`/`Infinity` and other non-standard inputs while accepting every valid
// JSON document.

export function parseStrictJson(source: string): unknown {
  const text = source;
  let index = 0;

  const fail = (message: string): never => {
    throw new SyntaxError(`${message} (at position ${index})`);
  };

  const skipWhitespace = (): void => {
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) index += 1;
      else break;
    }
  };

  const parseValue = (): unknown => {
    skipWhitespace();
    if (index >= text.length) fail('Unexpected end of input');
    const character = text.charAt(index);
    if (character === '{') return parseObject();
    if (character === '[') return parseArray();
    if (character === '"') return parseString();
    if (character === 't') return parseLiteral('true', true);
    if (character === 'f') return parseLiteral('false', false);
    if (character === 'n') return parseLiteral('null', null);
    if (character === '-' || isDigit(text.charCodeAt(index))) return parseNumber();
    fail(`Unexpected character '${character}'`);
  };

  const parseLiteral = (literal: string, value: unknown): unknown => {
    if (text.slice(index, index + literal.length) !== literal) fail('Invalid literal');
    index += literal.length;
    return value;
  };

  const parseObject = (): Record<string, unknown> => {
    index += 1; // '{'
    const result: Record<string, unknown> = {};
    const seenKeys = new Set<string>();
    skipWhitespace();
    if (text.charAt(index) === '}') {
      index += 1;
      return result;
    }
    for (;;) {
      skipWhitespace();
      if (text.charAt(index) !== '"') fail('Expected a string key');
      const key = parseString();
      if (seenKeys.has(key)) fail(`Duplicate key '${key}'`);
      seenKeys.add(key);
      skipWhitespace();
      if (text.charAt(index) !== ':') fail("Expected ':' after object key");
      index += 1;
      result[key] = parseValue();
      skipWhitespace();
      const delimiter = text.charAt(index);
      if (delimiter === ',') {
        index += 1;
        continue;
      }
      if (delimiter === '}') {
        index += 1;
        return result;
      }
      fail("Expected ',' or '}'");
    }
  };

  const parseArray = (): unknown[] => {
    index += 1; // '['
    const result: unknown[] = [];
    skipWhitespace();
    if (text.charAt(index) === ']') {
      index += 1;
      return result;
    }
    for (;;) {
      result.push(parseValue());
      skipWhitespace();
      const delimiter = text.charAt(index);
      if (delimiter === ',') {
        index += 1;
        continue;
      }
      if (delimiter === ']') {
        index += 1;
        return result;
      }
      fail("Expected ',' or ']'");
    }
  };

  const parseString = (): string => {
    index += 1; // opening '"'
    let result = '';
    for (;;) {
      if (index >= text.length) fail('Unterminated string');
      const character = text.charAt(index);
      if (character === '"') {
        index += 1;
        return result;
      }
      if (character === '\\') {
        index += 1;
        const escape = text.charAt(index);
        if (escape === '') fail('Unterminated escape sequence');
        switch (escape) {
          case '"':
            result += '"';
            break;
          case '\\':
            result += '\\';
            break;
          case '/':
            result += '/';
            break;
          case 'b':
            result += '\b';
            break;
          case 'f':
            result += '\f';
            break;
          case 'n':
            result += '\n';
            break;
          case 'r':
            result += '\r';
            break;
          case 't':
            result += '\t';
            break;
          case 'u': {
            const hex = text.slice(index + 1, index + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid unicode escape');
            result += String.fromCharCode(Number.parseInt(hex, 16));
            index += 4;
            break;
          }
          default:
            fail(`Invalid escape sequence '\\${escape}'`);
        }
        index += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) fail('Unescaped control character in string');
      result += character;
      index += 1;
    }
  };

  const parseNumber = (): number => {
    const start = index;
    if (text.charAt(index) === '-') index += 1;
    if (text.charAt(index) === '0') {
      index += 1;
      if (isDigit(text.charCodeAt(index))) fail('Leading zero in number');
    } else if (isDigit(text.charCodeAt(index))) {
      while (isDigit(text.charCodeAt(index))) index += 1;
    } else {
      fail('Invalid number');
    }
    if (text.charAt(index) === '.') {
      index += 1;
      if (!isDigit(text.charCodeAt(index))) fail('Invalid fraction');
      while (isDigit(text.charCodeAt(index))) index += 1;
    }
    if (text.charAt(index) === 'e' || text.charAt(index) === 'E') {
      index += 1;
      if (text.charAt(index) === '+' || text.charAt(index) === '-') index += 1;
      if (!isDigit(text.charCodeAt(index))) fail('Invalid exponent');
      while (isDigit(text.charCodeAt(index))) index += 1;
    }
    const value = Number(text.slice(start, index));
    if (!Number.isFinite(value)) fail('Number out of range');
    return value;
  };

  const value = parseValue();
  skipWhitespace();
  if (index < text.length) fail('Trailing content after JSON value');
  return value;
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}
