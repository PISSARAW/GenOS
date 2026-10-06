'use strict';

const crypto = require('node:crypto');
const SCHEMA = 'trinity.qualification/v1';
const VERSION = 1;

function fail(message) {
  throw Object.assign(new Error(message), { code: 'TRINITY_QUALIFICATION_CONTRACT_INVALID' });
}

function record(value, label) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label} must be a plain object.`);
  if (Object.getOwnPropertySymbols(value).length) fail(`${label} cannot have symbol keys.`);
  const descriptors = Object.values(Object.getOwnPropertyDescriptors(value));
  if (descriptors.some(item => !Object.hasOwn(item, 'value'))) fail(`${label} cannot have accessors.`);
  return value;
}

function keys(value, allowed, label) {
  record(value, label);
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${label} has an unknown field.`);
}

function string(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be nonempty text.`);
  stringValue(value);
  return value;
}

function list(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  jsonArray(value);
  return value;
}

function strings(value, label) {
  return list(value, label).map(item => string(item, label));
}

function choice(value, allowed, label) {
  if (!allowed.includes(value)) fail(`${label} has an unsupported value.`);
  return value;
}

function hashText(value) {
  return 'sha256:' + crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonical(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(stringValue(value));
  if (typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return finiteNumber(value);
  if (Array.isArray(value)) return '[' + jsonArray(value).map(canonical).join(',') + ']';
  return canonicalObject(value);
}

function jsonArray(value) {
  if (Object.getPrototypeOf(value) !== Array.prototype) fail('JSON arrays must have the standard prototype.');
  if (Object.getOwnPropertySymbols(value).length) fail('JSON arrays cannot have symbol keys.');
  const descriptors = Object.values(Object.getOwnPropertyDescriptors(value));
  if (descriptors.some(item => !Object.hasOwn(item, 'value'))) fail('JSON arrays cannot have accessors.');
  if (Object.keys(value).length !== value.length) fail('JSON arrays must be dense and have no extra fields.');
  if (Object.keys(value).some(key => String(Number(key)) !== key)) fail('JSON arrays cannot have named fields.');
  return value;
}

function stringValue(value) {
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) fail('JSON string has an unpaired surrogate.');
  return value;
}

function finiteNumber(value) {
  if (!Number.isFinite(value)) fail('JSON numbers must be finite.');
  return JSON.stringify(value);
}

function canonicalObject(value) {
  record(value, 'JSON value');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(stringValue(key)) + ':' + canonical(value[key])).join(',') + '}';
}

function hash(value) {
  return hashText(canonical(value));
}

function clone(value) {
  return JSON.parse(canonical(value));
}

function freeze(value) {
  if (value === null || typeof value !== 'object') return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function digest(value, label) {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) fail(`${label} must be a SHA256 digest.`);
  return value;
}

function original(value) {
  if (typeof value === 'string') return { text: string(value, 'originalMission'), sha256: hashText(value) };
  keys(value, ['text', 'sha256'], 'originalMission');
  const text = string(value.text, 'originalMission.text');
  if (value.sha256 !== hashText(text)) fail('Original mission digest mismatch.');
  return { text, sha256: value.sha256 };
}

function requirement(value) {
  keys(value, ['id', 'text', 'kind', 'scope', 'verificationRefs'], 'requirement');
  return { id: string(value.id, 'requirement.id'), text: string(value.text, 'requirement.text'),
    kind: choice(value.kind, ['artifact', 'semantic', 'proof', 'empirical'], 'requirement.kind'),
    scope: choice(value.scope, ['fixture', 'mission', 'universal'], 'requirement.scope'),
    verificationRefs: strings(value.verificationRefs, 'requirement.verificationRefs') };
}

function fixture(value) {
  keys(value, ['id', 'description', 'input', 'limitations', 'requirementIds'], 'fixture');
  return { id: string(value.id, 'fixture.id'), description: string(value.description, 'fixture.description'),
    input: clone(value.input), limitations: strings(value.limitations, 'fixture.limitations'),
    requirementIds: strings(value.requirementIds, 'fixture.requirementIds') };
}

function verification(value) {
  keys(value, ['id', 'verifierId', 'verifierVersion', 'verifierDigest', 'scope', 'requirementIds', 'fixtureIds'], 'verificationRef');
  return { id: string(value.id, 'verificationRef.id'), verifierId: string(value.verifierId, 'verifierRef.verifierId'),
    verifierVersion: string(value.verifierVersion, 'verificationRef.verifierVersion'),
    verifierDigest: digest(value.verifierDigest, 'verificationRef.verifierDigest'),
    scope: choice(value.scope, ['fixture', 'mission', 'universal'], 'verificationRef.scope'),
    requirementIds: strings(value.requirementIds, 'verificationRef.requirementIds'),
    fixtureIds: strings(value.fixtureIds, 'verificationRef.fixtureIds') };
}

function scope(value) {
  keys(value, ['kind', 'limitations'], 'scope');
  const result = { kind: choice(value.kind, ['fixture', 'mission'], 'scope.kind'), limitations: strings(value.limitations, 'scope.limitations') };
  if (result.kind === 'fixture' && !result.limitations.length) fail('Fixture scope must disclose limitations.');
  return result;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} must be unique.`);
}

function linked(contract) {
  const requirements = new Map(contract.requirements.map(item => [item.id, item]));
  const fixtures = new Map(contract.fixtures.map(item => [item.id, item]));
  const refs = new Map(contract.verificationRefs.map(item => [item.id, item]));
  unique(contract.requirements.map(item => item.id), 'Requirement IDs');
  unique(contract.fixtures.map(item => item.id), 'Fixture IDs');
  unique(contract.verificationRefs.map(item => item.id), 'Verifier IDs');
  contract.requirements.forEach(item => requirementLinks(item, refs));
  contract.fixtures.forEach(item => referenceIds(item.requirementIds, requirements));
  contract.verificationRefs.forEach(item => verifierLinks(item, { requirements, fixtures }));
}

function referenceIds(values, registry) {
  unique(values, 'References');
  if (values.some(id => !registry.has(id))) fail('Unresolved reference.');
}

function requirementLinks(item, refs) {
  referenceIds(item.verificationRefs, refs);
  if (!item.verificationRefs.length) fail('Each requirement needs a verification reference.');
  if (item.verificationRefs.some(id => !refs.get(id).requirementIds.includes(item.id))) fail('Asymmetric requirement reference.');
}

function verifierLinks(item, registries) {
  referenceIds(item.requirementIds, registries.requirements);
  referenceIds(item.fixtureIds, registries.fixtures);
  if (!item.requirementIds.length) fail('Verifier must cover a requirement.');
  if (item.scope === 'fixture' && !item.fixtureIds.length) fail('Fixture verifier needs a fixture.');
  if (item.requirementIds.some(id => !registries.requirements.get(id).verificationRefs.includes(item.id))) fail('Asymmetric verifier reference.');
  if (item.scope === 'fixture') fixtureCoverage(item, registries.fixtures);
}

function fixtureCoverage(ref, fixtures) {
  const covered = new Set(ref.fixtureIds.flatMap(id => fixtures.get(id).requirementIds));
  if (ref.requirementIds.some(id => !covered.has(id))) fail('Fixture verifier has no fixture for a covered requirement.');
}

module.exports = { SCHEMA, VERSION, fail, keys, string, list, hashText, canonical, hash, clone, freeze,
  digest, original, requirement, fixture, verification, scope, linked };
