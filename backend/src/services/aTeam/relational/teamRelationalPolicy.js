'use strict';

const { digest } = require('../../relationalPhysiology');

function fail(code, message = code) { return Object.assign(new Error(message), { code }); }

function normalize(value) {
  if (value == null || value === false) return null;
  if (value === true) return { version: 1, required: true };
  if (value.version !== 1 || value.required !== true
    || Object.keys(value).some(key => !['version', 'required'].includes(key))) {
    throw fail('ATEAM_RPE_POLICY_INVALID');
  }
  return { version: 1, required: true };
}

function required(run) { return normalize(run.relationalPolicy)?.required === true; }

function assertUnchanged(current, next) {
  if (digest(current.relationalPolicy || null) !== digest(next.relationalPolicy || null)) {
    throw fail('ATEAM_RPE_POLICY_CHANGED');
  }
}

module.exports = { normalize, required, assertUnchanged, fail };
