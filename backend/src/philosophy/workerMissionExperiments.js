'use strict';

const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { digest } = require('./contractFingerprint');
const { listRepresentativeMissions, representativeMissionPlan } = require('./representativeMissionExperiments');
const { ORGANIZATIONS, orderContracts, messageTrace, organizationOutcomeHash } = require('./organizationMissionExperiments');

const WORKER_PATH = path.join(__dirname, 'representativePairWorker.js');
const MAX_WORKER_DISPATCHES = 3;
const WORKER_TIMEOUT_MS = 5000;

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validateResponse(message, expected) {
  if (message?.kind === 'philosophy-worker-error') throw failure(message.error || 'PHILOSOPHY_WORKER_FAILED');
  if (message?.kind !== 'philosophy-worker-result') throw failure('PHILOSOPHY_WORKER_RESULT_INVALID');
  if (message.workerId !== expected.workerId || message.dispatchNonce !== expected.dispatchNonce) {
    throw failure('PHILOSOPHY_WORKER_BINDING_INVALID');
  }
  if (message.comparison?.contractId !== expected.contractId) throw failure('PHILOSOPHY_WORKER_CONTRACT_INVALID');
  return message;
}

function dispatchContract(contract, identity) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, { env: {},
      resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 } });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(failure('PHILOSOPHY_WORKER_TIMEOUT')), WORKER_TIMEOUT_MS);
    worker.once('error', (error) => finish(error));
    worker.once('exit', (code) => {
      if (!settled) finish(failure(code === 0 ? 'PHILOSOPHY_WORKER_NO_RESULT' : 'PHILOSOPHY_WORKER_CRASHED'));
    });
    worker.once('message', (message) => {
      try { finish(null, validateResponse(message, { ...identity, contractId: contract.id })); }
      catch (error) { finish(error); }
    });
    worker.postMessage({ contract, ...identity });
  });
}

function validNonce(value) {
  return typeof value === 'string' && /^[A-Za-z0-9-]{1,128}$/.test(value);
}

function executionCosts(results) {
  return {
    auditExecutions: results.reduce((sum, item) => sum + item.comparison.auditExecutions, 0),
    observationBytes: results.reduce((sum, item) => sum + item.comparison.observationBytes, 0),
    workerDispatches: results.length,
  };
}

function workerMessages(results) {
  return results.flatMap((item) => [
    { kind: 'worker-request', to: item.workerId, dispatchNonce: item.dispatchNonce },
    { kind: 'worker-result', from: item.workerId, dispatchNonce: item.dispatchNonce,
      resultHash: digest(item.comparison) },
  ]);
}

async function runWorkerMission(contracts, input = {}) {
  if (!ORGANIZATIONS.includes(input.organization)) throw failure('PHILOSOPHY_ORGANIZATION_INVALID');
  const plan = representativeMissionPlan(contracts, input.missionId);
  const ordered = orderContracts(plan.contracts, input.organization);
  const dispatchNonce = validNonce(input.dispatchNonce) ? input.dispatchNonce : randomUUID();
  const results = await Promise.all(ordered.map((contract, index) => dispatchContract(contract, {
    workerId: `philosophy-worker:${index}`, dispatchNonce: `${dispatchNonce}-${index}`,
  })));
  const comparisons = results.map((item) => item.comparison);
  const measuredCosts = executionCosts(results);
  const withinBudget = measuredCosts.auditExecutions <= plan.budget.maxAuditExecutions
    && measuredCosts.observationBytes <= plan.budget.maxObservationBytes
    && measuredCosts.workerDispatches <= MAX_WORKER_DISPATCHES;
  const payload = {
    apiVersion: 'genos.philosophy-worker-mission/v1', kind: 'worker-mission-receipt',
    missionId: plan.mission.id, organization: input.organization, dispatchNonce,
    contractIds: ordered.map((contract) => contract.id),
    budget: { ...plan.budget, maxWorkerDispatches: MAX_WORKER_DISPATCHES,
      workerTimeoutMs: WORKER_TIMEOUT_MS },
    measuredCosts, plannedTopologyMessages: messageTrace(input.organization,
      ordered.map((contract) => contract.id)),
    workerMessages: workerMessages(results), comparisons,
    outcomeHash: organizationOutcomeHash(comparisons),
    passed: withinBudget && comparisons.every((item) => item.sameInputs && item.correctionApplied),
    actualMissionExecution: true, actualOrganizationExecution: true, actualWorkerDispatch: true,
    actualTopologyExecution: false, externalFactsVerified: false, independentValidation: false,
  };
  return { ...payload, receiptHash: digest(payload), promotionEligible: false };
}

function payloadOf(receipt) {
  const { receiptHash, promotionEligible, ...payload } = receipt;
  return payload;
}

function receiptBoundaries(receipt) {
  const expected = { kind: 'worker-mission-receipt', passed: true,
    actualMissionExecution: true, actualOrganizationExecution: true, actualWorkerDispatch: true,
    actualTopologyExecution: false, externalFactsVerified: false,
    independentValidation: false, promotionEligible: false };
  return Boolean(receipt) && Object.entries(expected).every(([key, value]) => receipt[key] === value);
}

async function verifyWorkerMission(receipt, contracts) {
  if (!receiptBoundaries(receipt) || receipt.receiptHash !== digest(payloadOf(receipt))) return false;
  try {
    const replay = await runWorkerMission(contracts, {
      missionId: receipt.missionId, organization: receipt.organization,
      dispatchNonce: receipt.dispatchNonce,
    });
    return replay.passed && replay.receiptHash === receipt.receiptHash;
  } catch {
    return false;
  }
}

async function runWorkerCoverage(contracts) {
  const receipts = [];
  const missions = listRepresentativeMissions();
  for (const mission of missions) {
    for (const organization of ORGANIZATIONS) {
      receipts.push(await runWorkerMission(contracts, { missionId: mission.id, organization }));
    }
  }
  return {
    missionCount: missions.length, organizationRuns: receipts.length,
    workerDispatches: receipts.reduce((sum, receipt) => sum + receipt.measuredCosts.workerDispatches, 0),
    passed: receipts.filter((receipt) => receipt.passed).length,
    failed: receipts.filter((receipt) => !receipt.passed)
      .map((receipt) => `${receipt.missionId}:${receipt.organization}`),
    actualWorkerDispatch: true, actualTopologyExecution: false,
    externalFactsVerified: false, independentValidation: false, promotionEligible: false, receipts,
  };
}

module.exports = { runWorkerMission, verifyWorkerMission, runWorkerCoverage };
