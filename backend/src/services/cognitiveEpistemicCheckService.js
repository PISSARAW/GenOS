'use strict';

const crypto = require('node:crypto');
const schemaCheck = require('./cognitiveOmegaSchemaCheck');
const trust = require('./verifierTrustRegistry');
const adapters = require('./epistemic/verifierAdapters');
const { issueReceipt, validateReceipt } = require('./epistemicVerifierReceiptService');

const TYPES = ['test', 'reproducer', 'schema', 'smt', 'lean', 'aeis', 'shev', 'receipt'];
const INTENT_TYPES = Object.freeze(Object.fromEntries(TYPES.map((type) => [type, type])));

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function ensureTrust(type) {
  const existing = trust.listVerifiers().find((item) => item.type === type);
  if (existing) return existing.digest;
  const id = `omega-check-${type}`;
  return trust.registerVerifier({ id, type, digest: trust.computeVerifierDigest(type, '1.0'),
    description: `G-CIR Omega epistemic ${type} verifier` }).digest;
}

function statusResult(status, observations, extra = {}) {
  return { status, observations: observations || [], ...extra };
}

async function executeAdapter(candidate, descriptor, context) {
  const result = await adapters.executeVerifierWithAdapter(candidate, descriptor, context);
  if (result.status === 'verified') return statusResult('verified', result.observations, result);
  if (result.status === 'refuted') return statusResult('refuted', result.observations, result);
  return statusResult('inconclusive', result.observations, result);
}

async function checkTest(candidate, descriptor, context) {
  if (descriptor.type === 'reproducer' && context.db && (descriptor.job || candidate?.finding)) {
    const { reproduceFinding } = require('./daemon/verification/reproductionService');
    const result = await reproduceFinding(context.db, descriptor.job || candidate);
    return statusResult(result.reproduced ? 'verified' : 'inconclusive',
      [{ step: 'reproducer:execute', result }], { reproduction: result });
  }
  return executeAdapter(candidate, { ...descriptor, type: descriptor.type === 'reproducer' ? 'repro' : 'test' }, context);
}

function checkSchema(candidate, descriptor) {
  const result = schemaCheck.validate(candidate, descriptor);
  return statusResult(result.unavailable ? 'inconclusive' : result.valid ? 'verified' : 'refuted', [{ step: 'schema:validate', result }], {
    counterexamples: result.errors || [], schema: result.schema });
}

async function checkCommand(descriptor, runner) {
  if (!descriptor.command) return statusResult('inconclusive', [], { reason: 'verification_command_missing' });
  const result = await runner({ command: descriptor.command, cwd: descriptor.cwd,
    timeoutMs: descriptor.timeoutMs });
  const verdict = String(result.stdout || '').trim();
  const status = result.success && verdict === 'unsat' ? 'verified'
    : result.success && verdict === 'sat' ? 'refuted' : 'inconclusive';
  return statusResult(status, [{ step: `${descriptor.type}:execute`, result }], {
    execution: result });
}

async function checkLean(candidate, descriptor, context) {
  const { executeLeanCheck } = require('./epistemicScheduler/leanProcessExecutor');
  const source = descriptor.source || candidate?.source || candidate;
  if (typeof source !== 'string' || !source.trim()) return statusResult('inconclusive', [], { reason: 'lean_source_missing' });
  const execution = await executeLeanCheck({ ...descriptor, source,
    toolchainVersion: descriptor.toolchainVersion || context.toolchainVersion });
  const passed = execution.exitCode === 0 && (!execution.axioms || !descriptor.allowedAxioms
    || execution.axioms.every((axiom) => descriptor.allowedAxioms.includes(axiom)));
  return statusResult(passed ? 'verified' : 'refuted', [{ step: 'lean:check', result: execution }], {
    execution, formal: true });
}

async function checkAeis(candidate, descriptor, context) {
  const { evaluateReportWithAeis } = require('./epistemic/aeisPromotionBridge');
  const report = descriptor.report || candidate;
  const result = await evaluateReportWithAeis(report, { ...context, db: context.db,
    domain: descriptor.domain || context.domain, multiProviderEnabled: descriptor.multiProviderEnabled });
  const passed = result.allAccepted === true && result.evaluation?.eligible !== false;
  return statusResult(passed ? 'verified' : 'refuted', [{ step: 'aeis:evaluate', result }], { evaluation: result });
}

async function checkShev(candidate, descriptor, context) {
  const input = descriptor.input || candidate;
  if (typeof descriptor.verify === 'function') return normalizeExternal(await descriptor.verify(input, context));
  const adaptersByName = {
    json: require('./shev/adapters/jsonContractAdapter').verifyJsonContract,
    freshness: require('./shev/adapters/dataFreshnessAdapter').verifyDataFreshness,
  };
  const verify = adaptersByName[descriptor.adapter];
  if (!verify || !context.db) return statusResult('inconclusive', [], { reason: 'shev_adapter_unavailable' });
  const result = await verify(context.db, input);
  const passed = result.result === 'confirmed' || result.status === 'confirmed' || result.kind === 'state';
  return statusResult(passed ? 'verified' : 'refuted', [{ step: `shev:${descriptor.adapter}`, result }], { observation: result });
}

function checkReceipt(candidate, descriptor, context) {
  const receipts = Array.isArray(candidate) ? candidate : candidate?.receipts || [candidate];
  const trusted = context.trustedVerifierDigests || trust.listVerifierDigests();
  const valid = receipts.length > 0 && receipts.every((receipt) => validateReceipt(receipt, trusted)
    && receipt.status === 'verified' && (!descriptor.resultId || receipt.resultId === descriptor.resultId));
  return statusResult(valid ? 'verified' : 'refuted', [{ step: 'receipt:validate', count: receipts.length }], { receipts });
}

function normalizeExternal(result) {
  if (result?.status === 'verified' || result?.valid === true || result?.result === 'confirmed') {
    return statusResult('verified', [{ step: 'shev:external', result }], { external: result });
  }
  return statusResult(result?.status === 'refuted' || result?.valid === false ? 'refuted' : 'inconclusive',
    [{ step: 'shev:external', result }], { external: result });
}

function handlerFor(descriptor, options) {
  const type = descriptor.type;
  if (type === 'test' || type === 'reproducer') return (candidate, context) => checkTest(candidate, descriptor, context);
  if (type === 'schema') return (candidate) => checkSchema(candidate, descriptor);
  if (type === 'smt') return (_, context) => checkCommand(descriptor, context.runIsolated);
  if (type === 'lean') return (candidate, context) => checkLean(candidate, descriptor, context);
  if (type === 'aeis') return (candidate, context) => checkAeis(candidate, descriptor, context);
  if (type === 'shev') return (candidate, context) => checkShev(candidate, descriptor, context);
  if (type === 'receipt') return (candidate, context) => checkReceipt(candidate, descriptor, context);
  if (typeof options?.handlers?.[type] === 'function') return options.handlers[type];
  return null;
}

function createRegistry(options = {}) {
  const handlers = new Map();
  TYPES.forEach(ensureTrust);
  function register(reference, descriptor) {
    if (!reference || !descriptor?.type) throw new Error('epistemic_check_descriptor_invalid');
    const handler = handlerFor(descriptor, options);
    if (!handler) throw new Error(`epistemic_check_type_unsupported:${descriptor.type}`);
    handlers.set(reference, { descriptor, handler, verifierDigest: ensureTrust(descriptor.type) });
    return reference;
  }
  function resolve(intent, context = {}) {
    if (intent && typeof intent === 'object') return intent;
    const key = String(intent || '').trim().toLowerCase();
    const configured = options.descriptors?.[key] || options.verificationDescriptors?.[key];
    if (configured?.type) return { ...configured };
    const type = INTENT_TYPES[key];
    return type ? { type, domain: context.domain || undefined } : null;
  }
  function get(reference) {
    const entry = handlers.get(reference);
    if (!entry) return null;
    return async ({ candidate, context = {}, values }) => {
      const outcome = await entry.handler(candidate, { ...context, values,
        runIsolated: options.runIsolated || require('./sandboxExecutor').runIsolated });
      const status = outcome.status || 'inconclusive';
      const receipt = issueReceipt({ resultId: context.resultId || reference,
        evidenceDigest: digest(outcome.observations || outcome), verifierDigest: entry.verifierDigest,
        status, evidenceTypes: [entry.descriptor.type], executionEvidence: outcome.observations || [] });
      return { ...outcome, ...receipt, valid: status === 'verified' };
    };
  }
  return { register, get, resolve, verifierDigest: (reference) => handlers.get(reference)?.verifierDigest || null };
}

module.exports = { TYPES, createRegistry, digest };
