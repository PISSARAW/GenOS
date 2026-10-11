'use strict';

const crypto = require('node:crypto');
const provider = require('../regulation/externalCreditProviderService');
const { methodInput, error, resultReport } = require('./workerNativeEvidence');
const { assertActive } = require('./workerNativeLifecycle');

const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);

function assertCreditInput(method) {
  const input = methodInput(method, 'replenish_external_quota');
  if (!['tenantId', 'missionId', 'agentId', 'operationId'].every((key) => validId(input[key]))
    || !Number.isSafeInteger(input.amount) || input.amount <= 0
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw error('WORKER_CREDIT_INPUT_INVALID', 'Scoped account, operation, amount and version are required.');
  }
  return true;
}

function leaseMatches(lease, input) {
  return lease?.action === 'replenish_external_quota'
    && lease.tenantId === input.tenantId && lease.missionId === input.missionId
    && lease.targetAgentId === input.agentId && lease.operationId === input.operationId
    && Number.isSafeInteger(lease.maxAmount) && input.amount <= lease.maxAmount
    && lease.expectedVersion === input.expectedVersion
    && Date.parse(lease.expiresAt) > Date.now();
}

function assertLease(mission, input) {
  const contract = mission.workerContract;
  if (mission.workerKind !== 'recovery_worker' || contract?.authority?.execute !== true
    || contract?.identity?.parentId !== mission.orchestratorAgentId
    || !leaseMatches(contract?.mission?.externalCreditLease, input)) {
    throw error('WORKER_CREDIT_LEASE_DENIED', 'Persisted external credit lease does not authorize this transfer.');
  }
}

async function runCredit(method, context) {
  assertCreditInput(method);
  const input = method.parameters;
  assertLease(context.mission, input);
  assertActive(context);
  const completed = await provider.transfer(input);
  assertActive(context);
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify(completed.receipt)).digest('hex');
  const source = `provider://controlled-credit-provider/${input.operationId}/sha256:${digest}`;
  return resultReport(method, { creditReceipt: completed.receipt,
    creditObservation: completed.signedObservation, targetAgentId: input.agentId,
    recoveryReceipt: { action: 'replenish_external_quota',
      restoredState: 'credit:' + completed.observation.balance + '/' + completed.observation.capacity,
      receiptId: source, evidence: [source] } }, {
    type: 'dossier', statement: `External credit transfer ${input.operationId} verified for ${input.agentId}.`,
    sourceRefs: [source]
  });
}

module.exports = { assertCreditInput, runCredit };
