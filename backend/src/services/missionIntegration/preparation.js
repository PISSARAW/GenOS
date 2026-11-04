'use strict';
const { normalize, canonicalFields, digest, fail } = require('./contract');
const store = require('./receiptStore');
const stages = require('./stages');
const channel = require('./contextChannel');

function identity(input) {
  return { missionId: input.context.missionId, orchestratorId: input.context.orchestratorId };
}
function deadline(input, startedAt) {
  if (Date.now() - startedAt >= input.contract.maxPreparationMs) throw fail('MISSION_MECHANISMS_PREPARATION_TIMEOUT');
}
function remaining(request, elapsed) {
  const timeout = Number(request.timeoutMs);
  if (Number.isFinite(timeout)) {
    if (timeout - elapsed < 1000) throw fail('MISSION_MECHANISMS_PARENT_TIME_EXHAUSTED');
    request.timeoutMs = timeout - elapsed;
  }
}
function canonical(record) {
  return { contract: record.contract, contractDigest: digest(record.contract), receiptRef: record.receiptId,
    receiptDigest: digest(record), contextDigest: record.contextDigest };
}
function apply(input, record) {
  if (digest(input.context.task) !== record.contract.originalMissionDigest) throw fail('MISSION_MECHANISMS_MISSION_CHANGED');
  const block = stages.contextBlock(record.channel.contextText, record.receiptId);
  const mission = input.context.task + block, request = input.context.request;
  input.context.task = mission;
  request.mission = mission;
  for (const key of ['task', 'project_goal', 'projectGoal', 'goal']) if (request[key] !== undefined) request[key] = mission;
  request.allowedEvidenceRefs = [...new Set([...(request.allowedEvidenceRefs || []),
    `genos://mission-mechanisms/${record.receiptId}`])];
  request.missionMechanisms = canonical(record);
  return { record, nce: record.nce.result, ...canonicalFields(request) };
}
async function existing(db, input) {
  const record = await store.existing(db, identity(input));
  if (!record) return null;
  if (digest(record.contract) !== digest(input.contract) || record.workspaceId !== input.parent.workspace_id) {
    throw fail('MISSION_MECHANISMS_REPLAY_SCOPE_CHANGED');
  }
  await require('./qualification').verifyPreparation(db, { receipt: record });
  return apply(input, record);
}
async function execute(db, input) {
  const startedAt = Date.now();
  const research = await stages.runResearch(db, input);
  deadline(input, startedAt);
  const nce = await stages.runEcology(db, { ...input, research });
  deadline(input, startedAt);
  const delivery = await channel.deliver(db, { ...input, contextText: nce.contextText });
  deadline(input, startedAt);
  const receiptId = `mission-mechanisms-${digest({ ...identity(input), contract: input.contract })}`;
  const missionText = input.context.task + stages.contextBlock(delivery.contextText, receiptId);
  const agow = await stages.admitWorkspace(db, { ...input, missionText });
  deadline(input, startedAt);
  const elapsedMs = Date.now() - startedAt;
  remaining(input.context.request, elapsedMs);
  const record = await store.put(db, { schema: 'genos.mission-mechanisms-receipt/v1', receiptId,
    ...identity(input), organizationId: input.parent.organization_id, projectId: input.parent.project_id,
    workspaceId: input.parent.workspace_id, contract: input.contract,
    research: { receiptId: research.record.receiptId, digest: digest(research.record),
      context: research.context, usage: research.record.usage }, nce,
    channel: delivery, contextDigest: delivery.contextDigest, agow, preparedAt: new Date().toISOString(),
    elapsedMs, boundaries: { artisticQualityVerified: false, authorizesPromotion: false,
      contextRecoveryIsWorkerReplacement: false } });
  return apply(input, record);
}
async function prepare(db, input) {
  if (!input.context.request.missionMechanisms) return null;
  input.contract = normalize(input);
  const cached = await existing(db, input);
  return cached || execute(db, input);
}
module.exports = { prepare };
