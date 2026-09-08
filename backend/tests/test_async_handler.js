const assert = require('node:assert/strict');
const { asyncHandler } = require('../src/middleware/asyncHandler');

const expected = new Error('database unavailable');
let received;
asyncHandler(async () => { throw expected; })({}, {}, (error) => { received = error; });
setImmediate(() => {
  assert.equal(received, expected);
  console.log('Async route failures reach Express error middleware.');
});