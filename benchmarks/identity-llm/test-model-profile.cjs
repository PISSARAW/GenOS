'use strict';
const assert = require('node:assert/strict');
const { validate } = require('./protocol-validation.cjs');
const protocol = require('./protocol.json');
const baseline = require('./baseline-criteria.json');
const profile = require('./model-profile.json');

module.exports = function checks() {
  validate(protocol, baseline, profile);
  for (const key of Object.keys(baseline).filter(key => key !== 'modelSha256')) {
    assert.throws(() => validate({ ...protocol, [key]: null }, baseline, profile), /CRITERION_CHANGED/);
  }
  assert.throws(() => validate({ ...protocol, modelSha256: baseline.modelSha256 }, baseline, profile), /CRITERION_CHANGED/);
  assert.throws(() => validate(protocol, baseline, { ...profile, localOnly: false }), /LOCAL_MODEL_REQUIRED/);
  assert.throws(() => validate({ ...protocol, endpoint: 'https://remote.invalid' }, baseline, profile), /LOCAL_ENDPOINT_REQUIRED/);
  assert.throws(() => validate(protocol, baseline, { ...profile, historicalModelSha256: '0'.repeat(64) }), /HISTORICAL_MODEL_PIN_CHANGED/);
  assert.throws(() => validate({ ...protocol, modelBlob: 'another-model' }, baseline, profile), /MODEL_BLOB_CHANGED/);
  console.log('PASS model profile: new local weight pin and all25 original performance budget stopping fields protected');
};
