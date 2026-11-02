'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const f = require('./fixture.cjs');
const decisions = f.service('identity/decisions');
const boundary = f.service('identity/modelBoundary');
const DOMAINS = ['small-add', 'wide-add', 'small-product', 'wide-product'];

function task(input) {
  const bytes = crypto.createHash('sha256').update(`${input.seed}:${input.phase}:${input.index}`).digest();
  const domainIndex = input.index % DOMAINS.length;
  const phaseOffset = input.phase === 'train' ? 0 : 2000;
  const base = [10, 3000000000, 10, 3000000000][domainIndex] + phaseOffset;
  return { id: `${input.seed}:${input.phase}:${input.index}`, domain: DOMAINS[domainIndex],
    a: base + bytes.readUInt16BE(0) % 1000, b: base + bytes.readUInt16BE(2) % 1000,
    multiply: domainIndex >= 2 };
}

function exact(t) {
  const a = BigInt(t.a);
  const b = BigInt(t.b);
  return String(t.multiply ? a * b : a + b);
}

function fast(t) {
  return String((t.multiply ? t.a * t.b : t.a + t.b) | 0);
}

function precise(t) {
  const a = String(t.a).split('').reverse().map(Number);
  const b = String(t.b).split('').reverse().map(Number);
  const digits = Array(a.length + b.length + 1).fill(0);
  if (t.multiply) multiplyDigits(a, b, digits);
  else addDigits(a, b, digits);
  for (let i = 0; i < digits.length - 1; i++) {
    digits[i + 1] += Math.floor(digits[i] / 10);
    digits[i] %= 10;
  }
  return digits.reverse().join('').replace(/^0+(?=\d)/, '');
}

function multiplyDigits(a, b, digits) {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) digits[i + j] += a[i] * b[j];
  }
}

function addDigits(a, b, digits) {
  for (let i = 0; i < a.length; i++) digits[i] += a[i];
  for (let i = 0; i < b.length; i++) digits[i] += b[i];
}

async function train(db, context) {
  const t = task({ seed: context.seed, phase: 'train', index: context.cycle });
  const success = fast(t) === exact(t);
  const operationId = `worker:train:${context.cycle}`;
  const decision = await decisions.begin(db, { session: context.session, operationId,
    domain: t.domain, dimensions: ['characteristics'] });
  await decisions.finish(db, { session: context.session, operationId, success, attribution: 'self',
    evidenceRef: { taskId: t.id, oracle: 'bigint-v1', actual: fast(t), expected: exact(t) } });
  return { taskId: t.id, domain: t.domain, prediction: decision.prediction, success };
}

function resultFor(t, uncertainty, threshold) {
  const audit = uncertainty > threshold;
  const output = audit ? precise(t) : fast(t);
  return { success: output === exact(t), output, audit, cost: 1 + Number(audit) };
}

async function learnedResult(db, context) {
  const t = context.task;
  let uncertainty;
  const result = await boundary.run({ db, agentId: f.ROOT, identitySession: context.session,
    cognitiveDomain: t.domain }, async options => {
    uncertainty = options.cognitiveUncertainty;
    return resultFor(t, uncertainty, context.protocol.auditThreshold);
  });
  assert.equal(result.identity.agentId, f.ROOT);
  assert.equal(uncertainty, result.identity.uncertaintyApplied);
  return { ...result, prediction: 1 - uncertainty };
}

function scoreRows(rows) {
  return { tasks: rows.length, successRate: rows.filter(row => row.success).length / rows.length,
    audits: rows.filter(row => row.audit).length,
    cost: rows.reduce((total, row) => total + row.cost, 0),
    brier: rows.reduce((total, row) => total + (row.prediction - Number(row.fastSuccess)) ** 2, 0) / rows.length };
}

async function evaluate(db, context) {
  const before = await db.get('SELECT COUNT(*) AS n FROM agent_identity_decisions');
  const modelBefore = await decisions.selfModel(db, { agentId: f.ROOT });
  const probabilities = Object.fromEntries(modelBefore.capabilities.map(row => [row.domain, row.successProbability]));
  const rows = { learned: [], disabled: [], permuted: [], alwaysAudit: [] };
  for (let index = 0; index < context.protocol.evaluationTasks; index++) {
    const t = task({ seed: context.seed, phase: `holdout-${context.window}`, index });
    const fastSuccess = fast(t) === exact(t);
    const learned = await learnedResult(db, { ...context, task: t });
    rows.learned.push({ ...learned, fastSuccess, task: t, expected: exact(t), fastOutput: fast(t) });
    rows.disabled.push({ ...resultFor(t, 0, context.protocol.auditThreshold), prediction: 0.5, fastSuccess });
    const other = DOMAINS[DOMAINS.indexOf(t.domain) ^ 1];
    const probability = probabilities[other];
    rows.permuted.push({ ...resultFor(t, 1 - probability, context.protocol.auditThreshold), prediction: probability, fastSuccess });
    rows.alwaysAudit.push({ ...resultFor(t, 1, context.protocol.auditThreshold), prediction: 0.5, fastSuccess });
  }
  await unknownDomain(db, context);
  assert.deepEqual(await decisions.selfModel(db, { agentId: f.ROOT }), modelBefore);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM agent_identity_decisions')).n, before.n);
  return { window: context.window, feedbackWrites: 0, unknownDomainChecks: context.protocol.unknownDomainTasks,
    arms: Object.fromEntries(Object.entries(rows).map(([name, values]) => [name, scoreRows(values)])), trials: rows };
}

async function unknownDomain(db, context) {
  for (let index = 0; index < context.protocol.unknownDomainTasks; index++) {
    const result = await boundary.run({ db, agentId: f.ROOT, identitySession: context.session,
      cognitiveDomain: 'unseen-domain' }, async options => {
      assert.equal(options.cognitiveUncertainty, 0);
      return { checked: true };
    });
    assert.equal(result.identity.uncertaintyApplied, null);
  }
}

module.exports = { task, fast, precise, exact, train, evaluate, scoreRows };
