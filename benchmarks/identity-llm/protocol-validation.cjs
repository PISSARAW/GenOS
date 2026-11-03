'use strict';
const assert = require('node:assert/strict');

function validate(protocol, criteria, profile) {
  assert.equal(profile.localOnly, true, 'LOCAL_MODEL_REQUIRED');
  assert.equal(protocol.endpoint, 'http://127.0.0.1:18081', 'LOCAL_ENDPOINT_REQUIRED');
  assert.equal(profile.historicalModelSha256, criteria.modelSha256, 'HISTORICAL_MODEL_PIN_CHANGED');
  assert.match(profile.modelSha256, /^[0-9a-f]{64}$/);
  assert.match(profile.modelAlias, /^[A-Za-z0-9_-]+$/);
  for (const [key, value] of Object.entries(criteria)) {
    const expected = key === 'modelSha256' ? profile.modelSha256 : value;
    assert.deepEqual(protocol[key], expected, `CRITERION_CHANGED:${key}`);
  }
  assert.equal(protocol.modelAlias, profile.modelAlias, 'MODEL_ALIAS_CHANGED');
  assert.equal(protocol.modelBlob, profile.modelBlob, 'MODEL_BLOB_CHANGED');
  assert.equal(protocol.modelName, profile.displayName, 'MODEL_NAME_CHANGED');
}

module.exports = { validate };
