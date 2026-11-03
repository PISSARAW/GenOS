'use strict';

const crypto = require('node:crypto');
const { normalizeRelativePath } = require('../pathSafety');
const KIND = 'code_repair_obligations';
const SCHEMA = 'genos.code-repair-obligations/v1';
const LIMITS = Object.freeze({ obligations: 16, cases: 128, mutants: 16, mutantLinks: 32 });

function invalid() {
  throw Object.assign(new Error('A sealed, bounded repair obligation contract is required.'), {
    code: 'REPAIR_OBLIGATION_CONTRACT_INVALID'
  });
}

function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function id(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value); }
function boundedList(value, maximum) { return Array.isArray(value) && value.length > 0 && value.length <= maximum; }
function uniqueIds(items) { return items.every(id) && new Set(items).size === items.length; }

function assertContract(contract) {
  if (contract.kind !== KIND || !boundedList(contract.obligationIds, LIMITS.obligations)) invalid();
  if (!uniqueIds(contract.obligationIds) || !boundedList(contract.mutants, LIMITS.mutants)) invalid();
  if (!uniqueIds(contract.mutants.map(item => item?.id))) invalid();
  assertSources(contract);
  const covered = new Set();
  for (const mutant of contract.mutants) {
    assertMutant(mutant, contract.obligationIds);
    for (const obligation of mutant.obligationIds) covered.add(obligation);
  }
  if (contract.mutants.reduce((count, mutant) => count + mutant.obligationIds.length, 0) > LIMITS.mutantLinks) invalid();
  if (contract.obligationIds.some(obligation => !covered.has(obligation))) invalid();
  return contract;
}

function assertSources(contract) {
  const paths = [contract.artifactPath, contract.baselinePath, contract.suitePath];
  if (new Set(paths).size !== 3 || contract.sources.length !== 3) invalid();
  for (const relative of paths) {
    if (typeof relative !== 'string' || normalizeRelativePath(relative, 'repair source') !== relative) invalid();
    const source = contract.sources.find(item => item.path === relative);
    if (!source || !/^[a-f0-9]{64}$/.test(source.sha256)) invalid();
    if (relative === contract.artifactPath ? source.mutable !== true : ![undefined, false].includes(source.mutable)) invalid();
  }
}

function assertMutant(mutant, obligations) {
  if (typeof mutant.expression !== 'string' || !mutant.expression.trim() || mutant.expression.length > 1000) invalid();
  if (!boundedList(mutant.obligationIds, LIMITS.obligations) || !uniqueIds(mutant.obligationIds)) invalid();
  if (mutant.obligationIds.some(obligation => !obligations.includes(obligation))) invalid();
}

function assertSuite(suite, contract) {
  if (suite?.version !== 1 || !boundedList(suite.obligations, LIMITS.obligations)) invalid();
  const ids = suite.obligations.map(obligation => obligation?.id);
  if (!uniqueIds(ids) || JSON.stringify([...ids].sort()) !== JSON.stringify([...contract.obligationIds].sort())) invalid();
  let cases = 0;
  for (const obligation of suite.obligations) {
    assertObligation(obligation);
    cases += obligation.cases.length;
  }
  if (cases > LIMITS.cases || !suite.obligations.some(obligation => obligation.mode === 'regression')) invalid();
  return suite;
}

function assertObligation(obligation) {
  if (!['regression', 'preservation'].includes(obligation.mode)) invalid();
  if (typeof obligation.statement !== 'string' || !obligation.statement.trim() || obligation.statement.length > 512) invalid();
  if (!boundedList(obligation.cases, LIMITS.cases)) invalid();
  const inputs = new Set();
  for (const item of obligation.cases) {
    assertCase(item);
    const key = JSON.stringify([item.input.a, item.input.b]);
    if (inputs.has(key)) invalid();
    inputs.add(key);
  }
}

function assertCase(item) {
  if (!item || !item.input || Object.keys(item.input).sort().join(',') !== 'a,b') invalid();
  if (!Object.values(item.input).every(value => Number.isSafeInteger(value) && Math.abs(value) <= 1e6)) invalid();
  if (typeof item.expected !== 'number' || !Number.isFinite(item.expected) || Math.abs(item.expected) > 1e12) invalid();
}

function load(subject) {
  assertContract(subject.contract);
  const sources = new Map();
  for (const source of subject.sources) {
    if (sources.has(source.path) || typeof source.content !== 'string') invalid();
    if (source.sha256 !== hash(source.content)) invalid();
    sources.set(source.path, source);
  }
  if (sources.size !== 3) invalid();
  for (const sealed of subject.contract.sources) {
    const source = sources.get(sealed.path);
    if (!source || (!sealed.mutable && source.sha256 !== sealed.sha256)) invalid();
  }
  const suite = assertSuite(JSON.parse(sources.get(subject.contract.suitePath).content), subject.contract);
  return { suite, sources };
}

function binding(subject) {
  const { suite, sources } = load(subject);
  const contract = subject.contract;
  return { schema: SCHEMA, scope: 'declared_finite_cases', contractHash: require('../trinityProvenanceValues').digest(contract),
    artifactContentHash: sources.get(contract.artifactPath).sha256,
    baselineContentHash: sources.get(contract.baselinePath).sha256,
    suiteContentHash: sources.get(contract.suitePath).sha256,
    obligations: suite.obligations.map(obligation => ({ id: obligation.id, mode: obligation.mode,
      totalCases: obligation.cases.length,
      mutantIds: contract.mutants.filter(mutant => mutant.obligationIds.includes(obligation.id)).map(mutant => mutant.id).sort() })) };
}

module.exports = { KIND, SCHEMA, LIMITS, assertContract, assertSuite, load, binding };
