'use strict';

const { createHash, randomUUID } = require('crypto');
const communityStore = require('../communityStore');
const { assertValidConstitution } = require('./constitutionValidator');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function constitutionHash(constitution) {
  return createHash('sha256').update(JSON.stringify(canonicalize(constitution))).digest('hex');
}

async function commitVersion(input) {
  const latest = await communityStore.latestConstitution(input.db, input.communityId);
  const reason = String(input.reason || '').trim();
  if (latest && !reason) {
    throw Object.assign(new Error('A reason is required to create a new constitution version.'), {
      code: 'BIOCENOSE_CONSTITUTION_REASON_REQUIRED'
    });
  }
  const record = {
    constitutionId: randomUUID(),
    communityId: input.communityId,
    version: Number(latest?.version || 0) + 1,
    constitution: input.constitution,
    constitutionHash: constitutionHash(input.constitution),
    actorId: input.actorId || null,
    reason: reason || 'Initial community constitution'
  };
  assertValidConstitution(record);
  return communityStore.saveConstitution(input.db, record);
}

async function loadVersion(db, constitutionId) {
  return communityStore.loadConstitution(db, constitutionId);
}

module.exports = { canonicalize, constitutionHash, commitVersion, loadVersion };
