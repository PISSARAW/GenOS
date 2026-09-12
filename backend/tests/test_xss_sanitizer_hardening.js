const assert = require('node:assert/strict');
const { sanitizeString, sanitizeObject } = require('../src/middleware/security');

const attacks = [
  '<script>alert(1)</script>',
  '<scr<script>ipt>alert(1)</script>',
  '<svg onload="alert(1)">',
  '<svg/onload=alert(1)>',
  '<img src=x onerror=alert(1)>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<a href="javascript:void(0)">Click</a>',
  '<body onload=alert(1)>'
];

for (const attack of attacks) {
  const clean = sanitizeString(attack);
  assert.equal(/<script/i.test(clean), false, `script survives: ${attack}`);
  assert.equal(/javascript:/i.test(clean), false, `javascript: survives: ${attack}`);
  assert.equal(/onerror=/i.test(clean), false, `onerror survives: ${attack}`);
  assert.equal(/onload=/i.test(clean), false, `onload survives: ${attack}`);
  assert.equal(/<iframe/i.test(clean), false, `iframe survives: ${attack}`);
  assert.equal(/[<>]/.test(clean), false, `angle brackets survive: ${attack}`);
}

assert.equal(sanitizeString(42), 42);
const nested = sanitizeObject({ name: '<scr<script>ipt>x</script>', tags: ['<img src=x onerror=alert(1)>'] });
assert.equal(/[<>]/.test(nested.name), false);
assert.equal(nested.tags.some((tag) => /[<>]/.test(tag)), false);

console.log('XSS sanitizer hardening checks passed.');
