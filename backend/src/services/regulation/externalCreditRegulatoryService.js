'use strict';

const { isDeepStrictEqual } = require('node:util');
const { withTransaction } = require('../../db');
const regulatory = require('./regulatoryStateService');
const bridge = require('./regulatoryBridgeService');
const persistence = require('./regulatoryPersistenceService');
const provider = require('./externalCreditProviderService');

function refuse(code, message) {
  return Object.assign(new Error(message), { code });
}

function parse(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

async function targetContract(db, mission) {
  const row = await db.get('SELECT parent_agent_id,execution_mode,metadata_json,workspace_id FROM agents WHERE id=?', mission.agentId);
  const persisted = parse(row?.metadata_json);
  const contract = mission.workerContract?.mission;
  if (!row || row.execution_mode !== 'worker'
    || row.parent_agent_id !== mission.orchestratorAgentId
    || persisted.workerKind !== mission.workerKind
    || !isDeepStrictEqual(persisted.workerContract?.mission?.externalCredit, contract?.externalCredit)
    || !isDeepStrictEqual(persisted.workerContract?.mission?.regulatoryExternalRecovery,
      contract?.regulatoryExternalRecovery)) {
    throw refuse('EXTERNAL_CREDIT_CONTRACT_INVALID', 'Persisted target contract does not match the runtime mission.');
  }
  return { row, account: contract.externalCredit, recovery: contract.regulatoryExternalRecovery };
}

function validateAccount(mission, account) {
  if (!account || account.agentId !== mission.agentId
    || account.missionId !== mission.missionId
    || !account.tenantId || !Number.isSafeInteger(account.capacity) || account.capacity < 1) {
    throw refuse('EXTERNAL_CREDIT_CONTRACT_INVALID', 'External credit account is not bound to the target mission.');
  }
}

function validHelperRecord({ row, metadata, mission, target }) {
  return ['completed', 'idle'].includes(String(row?.status || '').toLowerCase())
    && row.run_status === 'completed'
    && row.parent_agent_id === mission.orchestratorAgentId
    && row.workspace_id === target.row.workspace_id
    && metadata.workerKind === 'recovery_worker';
}

async function hasDurableWorkerCompletion(db, workerId, runId) {
  const events = await db.all(`SELECT payload_json FROM telemetry_events
    WHERE agent_id=? AND event_type='AGENT_COMPLETED' ORDER BY rowid DESC LIMIT 20`, workerId);
  return events.some((event) => {
    try { return parse(event.payload_json).executionRunId === runId; }
    catch (_) { return false; }
  });
}

function validHelperScope(method, lease, reference) {
  const input = method?.parameters;
  return method?.methodId === 'replenish_external_quota'
    && lease?.action === 'replenish_external_quota'
    && input?.operationId === reference.operationId
    && input?.amount <= lease.maxAmount;
}

function validHelperAccount({ input, lease, mission, target }) {
  return input?.tenantId === target.account.tenantId
    && input?.missionId === target.account.missionId
    && input?.agentId === mission.agentId
    && lease.targetAgentId === mission.agentId;
}

async function recoveryWorker(db, mission, target) {
  const ref = target.recovery;
  if (!ref?.recoveryAgentId || !ref.recoveryRunId || !ref.operationId) {
    throw refuse('EXTERNAL_CREDIT_RECOVERY_REQUIRED', 'A completed recovery worker is required.');
  }
  const row = await db.get(`SELECT a.id,a.status,a.parent_agent_id,a.workspace_id,a.metadata_json,
    r.id AS run_id,r.status AS run_status FROM agents a JOIN strategy_execution_runs r ON r.agent_id=a.id
    WHERE a.id=? AND r.id=?`, ref.recoveryAgentId, ref.recoveryRunId);
  const metadata = parse(row?.metadata_json);
  const method = metadata.workerContract?.mission?.methodContract;
  const lease = metadata.workerContract?.mission?.externalCreditLease;
  const input = method?.parameters;
  if (!validHelperRecord({ row, metadata, mission, target })
    || !validHelperScope(method, lease, ref)
    || !validHelperAccount({ input, lease, mission, target })
    || !await hasDurableWorkerCompletion(db, ref.recoveryAgentId, ref.recoveryRunId)) {
    throw refuse('EXTERNAL_CREDIT_RECOVERY_UNVERIFIED', 'Recovery worker run or persisted lease does not match the target.');
  }
  return input;
}
function measurementMatches(observed, signed, input) {
  return observed.agentId === input.agentId && observed.missionId === input.missionId
    && observed.accountVersion === signed.afterVersion && observed.balance === signed.after;
}
async function evidence(db, reference, input) {
  const rows = await db.all(`SELECT payload_json FROM telemetry_events
    WHERE agent_id=? AND event_type='EVIDENCE_REPORT' ORDER BY id DESC LIMIT 20`,
  reference.recoveryAgentId);
  let found = rows.map((row) => parse(row.payload_json))
    .find((event) => event?.executionRunId === reference.recoveryRunId);
  for (let attempt = 0; !found && attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const pending = await db.all(`SELECT payload_json FROM telemetry_events
      WHERE agent_id=? AND event_type='EVIDENCE_REPORT' ORDER BY id DESC LIMIT 20`,
    reference.recoveryAgentId);
    found = pending.map((row) => parse(row.payload_json))
      .find((event) => event?.executionRunId === reference.recoveryRunId);
  }
  const content = found?.evidenceReport?.workerArtifact?.content;
  const receipt = content?.creditReceipt;
  const observation = content?.creditObservation;
  if (found?.evidenceReport?.outcome !== 'success' || !receipt || !observation) {
    throw refuse('EXTERNAL_CREDIT_RECOVERY_UNVERIFIED', 'Native credit evidence is missing.');
  }
  const signed = provider.checkReceipt(receipt, input);
  const observed = provider.checkHistoricalObservation(observation, input);
  if (!isDeepStrictEqual(signed, await provider.operation(input))
    || !measurementMatches(observed, signed, input)) {
    throw refuse('EXTERNAL_CREDIT_RECOVERY_UNVERIFIED', 'Native evidence differs from provider operation.');
  }
  return { signed, observation };
}

async function measuredEnergy(db, mission, account) {
  const observed = await provider.balance(account);
  if (observed.capacity !== account.capacity) {
    throw refuse('EXTERNAL_CREDIT_MEASUREMENT_INVALID', 'Provider capacity differs from persisted mission contract.');
  }
  const before = await persistence.sync(db, mission.agentId);
  const energy = Math.min(1, observed.balance / observed.capacity);
  if (before.energy === energy) return { observed, state: before };
  const state = regulatory.updateState(mission.agentId, { energy });
  await persistence.save(db, mission.agentId, state);
  return { observed, state };
}

async function ensureExternalFunctional(db, mission) {
  const target = await targetContract(db, mission);
  validateAccount(mission, target.account);
  const before = await measuredEnergy(db, mission, target.account);
  const functional = bridge.functional(bridge.toSnapshot(mission.agentId));
  const recorded = target.recovery?.operationId && await db.get(`SELECT operation_id
    FROM regulatory_external_recoveries WHERE operation_id=? AND agent_id=?`,
  target.recovery.operationId, mission.agentId);
  if (functional && (before.observed.accountVersion === 0 || recorded)) {
    return { recovered: false, state: before.state, measurement: before.observed };
  }
  const input = await recoveryWorker(db, mission, target);
  const proof = await evidence(db, target.recovery, input);
  const after = await provider.balance(target.account);
  if (after.accountVersion !== proof.signed.afterVersion
    || after.balance !== proof.signed.after
    || after.balance < Math.ceil(after.capacity * 0.4)) {
    throw refuse('EXTERNAL_CREDIT_RECOVERY_UNVERIFIED', 'Measured balance remains below the functional threshold.');
  }
  const updated = regulatory.updateState(mission.agentId,
    { energy: Math.min(1, after.balance / after.capacity) });
  if (!bridge.functional(bridge.toSnapshot(mission.agentId))) {
    regulatory.hydrateState(mission.agentId, before.state);
    throw refuse('EXTERNAL_CREDIT_RECOVERY_UNVERIFIED', 'Other regulatory variables remain outside functional bounds.');
  }
  try {
    await withTransaction(db, async () => persistence.consumeExternal(db, {
      agentId: mission.agentId, operationId: input.operationId,
      recoveryAgentId: target.recovery.recoveryAgentId,
      recoveryRunId: target.recovery.recoveryRunId,
      before: before.state, after: updated, measurement: after
    }));
  } catch (error) {
    regulatory.hydrateState(mission.agentId, before.state);
    throw error;
  }
  return { recovered: true, state: updated, measurement: after, operationId: input.operationId };
}

module.exports = { ensureExternalFunctional };
