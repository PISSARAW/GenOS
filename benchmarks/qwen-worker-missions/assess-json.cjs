'use strict';

function decimalForm(source) {
  const [mantissa, exponent = '0'] = source.toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.replace(/^-/, '').split('.');
  const digits = (whole + fraction).replace(/^0+/, '');
  if (!digits) return '0';
  const trimmed = digits.replace(/0+$/, '');
  const power = BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - trimmed.length);
  return `${source.startsWith('-') ? '-' : ''}${trimmed}e${power}`;
}

class ClaimScanner {
  constructor(text) {
    if (text.length > 65536) throw new SyntaxError('Claim exceeds the parser bound.');
    this.text = text; this.position = 0;
  }

  skip() {
    while (/[ \t\r\n]/.test(this.text[this.position] || 'x')) this.position += 1;
  }

  take(character) {
    this.skip();
    if (this.text[this.position] !== character) return false;
    this.position += 1; return true;
  }

  expect(character) {
    if (!this.take(character)) throw new SyntaxError('Invalid JSON separator.');
  }

  token(pattern) {
    pattern.lastIndex = this.position;
    const match = pattern.exec(this.text);
    if (!match) throw new SyntaxError('Invalid JSON token.');
    this.position = pattern.lastIndex; return match[0];
  }

  string() {
    return JSON.parse(this.token(/"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y));
  }

  number() {
    const text = this.token(/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y);
    const value = Number(text);
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new SyntaxError('Number is outside the exact supported range.');
    }
    if (decimalForm(text) !== decimalForm(JSON.stringify(value))) {
      throw new SyntaxError('Number loses decimal precision when decoded.');
    }
  }

  object(depth) {
    if (depth > 64) throw new SyntaxError('Claim exceeds the nesting bound.');
    this.expect('{'); const keys = new Set();
    if (this.take('}')) return;
    do {
      this.skip(); const key = this.string();
      if (keys.has(key)) throw new SyntaxError('Duplicate decoded JSON key.');
      keys.add(key); this.expect(':'); this.value(depth);
    } while (this.take(','));
    this.expect('}');
  }

  array(depth) {
    if (depth > 64) throw new SyntaxError('Claim exceeds the nesting bound.');
    this.expect('[');
    if (this.take(']')) return;
    do { this.value(depth); } while (this.take(','));
    this.expect(']');
  }

  value(depth) {
    if (depth > 64) throw new SyntaxError('Claim exceeds the nesting bound.');
    this.skip(); const head = this.text[this.position];
    if (head === '{') return this.object(depth + 1);
    if (head === '[') return this.array(depth + 1);
    if (head === '"') return this.string();
    if (head === '-' || /[0-9]/.test(head || 'x')) return this.number();
    this.token(/(?:true|false|null)/y);
  }

  finish() {
    this.value(0); this.skip();
    if (this.position !== this.text.length) throw new SyntaxError('Trailing claim content.');
  }
}

function parseExactJson(text) {
  try {
    new ClaimScanner(text).finish();
    return JSON.parse(text);
  } catch { return null; }
}

module.exports = { parseExactJson };
