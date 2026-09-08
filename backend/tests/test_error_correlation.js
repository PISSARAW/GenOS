const assert = require('node:assert/strict');
const { errorHandler } = require('../src/middleware/errorHandler');

let statusCode;
let payload;
const res = {
  status(code) { statusCode = code; return this; },
  json(body) { payload = body; }
};
errorHandler(Object.assign(new Error('bad request'), { status: 400, code: 'INVALID_ARGUMENT' }), {
  id: 'req-1', headers: { 'x-trace-id': 'trace-1' }
}, res, () => {});
assert.equal(statusCode, 400);
assert.deepEqual(payload.error, { code: 'INVALID_ARGUMENT', message: 'bad request', requestId: 'req-1', traceId: 'trace-1' });
console.log('HTTP errors expose request and trace correlation identifiers.');