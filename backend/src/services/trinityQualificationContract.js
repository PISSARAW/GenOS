'use strict';

const schema = require('./trinityQualificationSchema');
const verification = require('./trinityQualificationVerification');
const crypto = require('node:crypto');
const PUBLIC_KEYS = ['schema', 'version', 'originalMission', 'requirements', 'fixtures', 'verificationRefs', 'scope', 'oracleCommitment', 'hash'];
const INPUT_KEYS = ['originalMission', 'requirements', 'fixtures', 'verificationRefs', 'scope', 'privateOracle'];

function body(input) {
  return { schema: schema.SCHEMA, version: schema.VERSION,
    originalMission: schema.original(input.originalMission),
    requirements: schema.list(input.requirements, 'requirements').map(schema.requirement),
    fixtures: schema.list(input.fixtures, 'fixtures').map(schema.fixture),
    verificationRefs: schema.list(input.verificationRefs, 'verificationRefs').map(schema.verification),
    scope: schema.scope(input.scope) };
}

function create(input) {
  schema.keys(input, INPUT_KEYS, 'contract input');
  const publicContract = body(input);
  if (!publicContract.requirements.length) schema.fail('At least one explicit requirement is required.');
  schema.linked(publicContract);
  const privateOracle = Object.hasOwn(input, 'privateOracle') ? schema.clone(input.privateOracle) : null;
  const privateOracleNonce = Object.hasOwn(input, 'privateOracle') ? crypto.randomBytes(32).toString('hex') : null;
  if (privateOracleNonce) publicContract.oracleCommitment = schema.hash({ nonce: privateOracleNonce, oracle: privateOracle });
  publicContract.hash = schema.hash(publicContract);
  return schema.freeze({ publicContract, privateOracle, privateOracleNonce });
}

function normalizedPublic(input) {
  schema.keys(input, PUBLIC_KEYS, 'public contract');
  if (input.schema !== schema.SCHEMA || input.version !== schema.VERSION) schema.fail('Unsupported contract version.');
  const result = body(input);
  if (!result.requirements.length) schema.fail('At least one explicit requirement is required.');
  schema.linked(result);
  if (Object.hasOwn(input, 'oracleCommitment')) result.oracleCommitment = schema.digest(input.oracleCommitment, 'oracleCommitment');
  if (input.hash !== schema.hash(result)) schema.fail('Public contract digest mismatch.');
  return { ...result, hash: input.hash };
}

function publicProjection(input) {
  return schema.freeze(normalizedPublic(input));
}

function validate(input, options = {}) {
  try {
    if (legacy(input)) return { valid: true, qualified: false, legacy: true, errors: ['legacy_contract_not_qualified'] };
    const contract = normalizedPublic(input);
    checkOriginal(contract, options);
    return { valid: true, qualified: true, legacy: false, errors: [] };
  } catch (error) {
    return { valid: false, qualified: false, legacy: false, errors: [error.message] };
  }
}

function legacy(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  return !Object.hasOwn(input, 'schema') && !Object.hasOwn(input, 'version');
}

function checkOriginal(contract, options) {
  if (options.expectedOriginalHash !== undefined && options.expectedOriginalHash !== contract.originalMission.sha256) {
    schema.fail('Contract differs from the externally sealed original mission.');
  }
}

function verify(contract, candidate, context = {}) {
  const validation = validate(contract, context);
  if (!validation.qualified) return verification.unqualified(validation);
  return verification.verify(publicProjection(contract), candidate, context);
}

function promptInstruction(contract) {
  const publicContract = publicProjection(contract);
  return 'Versioned public mission contract: ' + schema.canonical(publicContract)
    + '\nReturn a candidate. Fixture passes establish only their stated scope. Unmeasured coverage is null; finite trials cannot prove universal claims. Acceptance and promotion require independent runtime gates.';
}

module.exports = { create, validate, verify, publicProjection, promptInstruction,
  hash: schema.hash, hashText: schema.hashText, SCHEMA: schema.SCHEMA, VERSION: schema.VERSION };
