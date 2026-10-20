'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const gate = require('./campaignActivationGateService');

const ALLOWED_OUTCOMES = new Set([
  'SUCCEEDED', 'FAILED', 'NO_CHANGE', 'INTERVENTION_REQUIRED', 'INCONCLUSIVE'
]);

function failure(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function requireValue(condition, code) {
  if (!condition) throw failure(code);
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function sameMembers(left, right) {
  return Array.isArray(left) && left.length === right.length
    && right.every((item) => left.includes(item));
}

function validateConfig(config, currentRevision) {
  requireValue(config?.schema === 'genos.qualification-campaign/v1', 'CAMPAIGN_CONFIG_INVALID');
  requireValue(config?.status === 'configured_not_run', 'CAMPAIGN_CONFIG_INVALID');
  requireValue(typeof config?.campaignId === 'string' && config.campaignId.length > 0,
    'CAMPAIGN_CONFIG_INVALID');
  requireValue(/^[a-f0-9]{40}$/.test(config?.revision || ''), 'CAMPAIGN_REVISION_INVALID');
  requireValue(config.revision === currentRevision, 'CAMPAIGN_REVISION_MISMATCH');
  requireValue(sameMembers(config.activationRequirements, gate.REQUIRED_EVIDENCE),
    'CAMPAIGN_ACTIVATION_POLICY_WEAKENED');
  const workloads = config.workloads;
  requireValue(Array.isArray(workloads) && workloads.length === 2, 'CAMPAIGN_WORKLOADS_INVALID');
  requireValue(new Set(workloads.map((item) => item.id)).size === workloads.length,
    'CAMPAIGN_WORKLOADS_INVALID');
  requireValue(new Set(workloads.map((item) => item.adapterId)).size === workloads.length,
    'CAMPAIGN_ADAPTER_BINDING_REQUIRED');
  requireValue(same(workloads.map((item) => item.kind).sort(), ['ett_v2', 'stewardship']),
    'CAMPAIGN_WORKLOADS_INVALID');
  requireValue(workloads.every((item) => item.adapterId && item.configuration),
    'CAMPAIGN_ADAPTER_BINDING_REQUIRED');
  requireValue(['tokens', 'usd', 'seconds'].every((key) => Number.isFinite(config.costBudget?.[key])
    && config.costBudget[key] > 0), 'CAMPAIGN_BUDGET_INVALID');
}

function stateMaterial(state) {
  const { stateHash, ...material } = state;
  return material;
}

function sealState(state) {
  const material = stateMaterial(state);
  return { ...material, stateHash: gate.digest(material) };
}

function eventMaterial(event) {
  const { eventHash, ...material } = event;
  return material;
}

function validEvents(events) {
  let previousHash = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.sequence !== index + 1 || event.previousHash !== previousHash
      || event.eventHash !== gate.digest(eventMaterial(event))) return false;
    previousHash = event.eventHash;
  }
  return true;
}

function validState(state) {
  return state?.schema === 'genos.qualification-campaign-state/v1'
    && Array.isArray(state.events) && validEvents(state.events)
    && state.stateHash === gate.digest(stateMaterial(state));
}

function writeState(outputPath, state) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, outputPath);
}

function readState(outputPath) {
  if (!fs.existsSync(outputPath)) return null;
  return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
}

function appendEvent(state, input) {
  const previous = state.events.at(-1)?.eventHash || null;
  const material = { sequence: state.events.length + 1, previousHash: previous, ...input };
  return sealState({ ...state, events: [...state.events,
    { ...material, eventHash: gate.digest(material) }] });
}

function initialState(config, configHash) {
  return sealState({
    schema: 'genos.qualification-campaign-state/v1', campaignId: config.campaignId,
    configHash, revision: config.revision, status: 'running', events: [], dossier: null
  });
}

function validCostIdentity(cost, adapter) {
  return cost?.schema === 'genos.external-campaign-cost/v1'
    && cost.source === 'external'
    && cost.meterId !== adapter.id
    && typeof cost.meterKeyId === 'string' && cost.meterKeyId.length > 0
    && typeof cost.receiptRef === 'string' && cost.receiptRef.length > 0
    && /^[a-f0-9]{64}$/.test(cost.receiptHash || '');
}

function validExternalCost(cost, adapter) {
  return validCostIdentity(cost, adapter)
    && ['tokens', 'usd', 'seconds'].every((key) => Number.isFinite(cost[key]) && cost[key] >= 0);
}

function sealedCost(cost) {
  return { ...cost, costHash: gate.digest(cost) };
}

function failedResult(workload, code) {
  return { outcomes: [{ status: 'FAILED', code, workloadId: workload.id }],
    proofs: [], externalCost: null, costMeasurementStatus: 'MISSING' };
}

function normalizeResult(workload, adapter, result) {
  if (!Array.isArray(result?.outcomes) || result.outcomes.length === 0
    || !result.outcomes.every((item) => ALLOWED_OUTCOMES.has(item.status))) {
    return failedResult(workload, 'CAMPAIGN_ADAPTER_RESULT_INVALID');
  }
  if (!validExternalCost(result.externalCost, adapter)) {
    return failedResult(workload, 'CAMPAIGN_EXTERNAL_COST_UNVERIFIED');
  }
  return {
    outcomes: result.outcomes.map((item) => ({ ...item, workloadId: workload.id })),
    proofs: Array.isArray(result.proofs) ? result.proofs : [],
    externalCost: sealedCost(result.externalCost),
    costMeasurementStatus: 'EXTERNAL_MEASURED'
  };
}

async function callAdapter(workload, context) {
  const adapter = context.adapters[workload.adapterId];
  if (!adapter || adapter.id !== workload.adapterId || typeof adapter.execute !== 'function') {
    return failedResult(workload, 'CAMPAIGN_EXPLICIT_ADAPTER_REQUIRED');
  }
  try {
    const result = await adapter.execute({
      campaignId: context.config.campaignId, workloadId: workload.id,
      kind: workload.kind, configuration: workload.configuration,
      revision: context.config.revision, configHash: context.configHash,
      idempotencyKey: gate.digest({ configHash: context.configHash, workloadId: workload.id })
    });
    return normalizeResult(workload, adapter, result);
  } catch (error) {
    return failedResult(workload, error?.code || 'CAMPAIGN_ADAPTER_FAILED');
  }
}

function completedWorkloads(state) {
  return new Set(state.events.filter((event) => event.type === 'WORKLOAD_COMPLETED')
    .map((event) => event.workloadId));
}

function startedWorkloads(state) {
  return new Set(state.events.filter((event) => event.type === 'WORKLOAD_STARTED')
    .map((event) => event.workloadId));
}

async function executePending(state, context) {
  let current = state;
  for (const workload of context.config.workloads) {
    if (completedWorkloads(current).has(workload.id)) continue;
    if (!startedWorkloads(current).has(workload.id)) {
      current = appendEvent(current, { type: 'WORKLOAD_STARTED', workloadId: workload.id,
        adapterId: workload.adapterId });
      writeState(context.outputPath, current);
    }
    const result = await callAdapter(workload, context);
    current = appendEvent(current, { type: 'WORKLOAD_COMPLETED', workloadId: workload.id,
      adapterId: workload.adapterId, result });
    writeState(context.outputPath, current);
  }
  return current;
}

function summarizeCosts(workloads, budget) {
  const measured = workloads.map((item) => item.externalCost).filter(Boolean);
  const total = Object.fromEntries(['tokens', 'usd', 'seconds'].map((key) =>
    [key, measured.reduce((sum, item) => sum + item[key], 0)]));
  return {
    budget, total, receipts: measured,
    measurementComplete: measured.length === workloads.length,
    withinBudget: ['tokens', 'usd', 'seconds'].every((key) => total[key] <= budget[key])
  };
}

function buildDossier(state, config) {
  const completed = state.events.filter((event) => event.type === 'WORKLOAD_COMPLETED');
  const workloads = completed.map((event) => ({ workloadId: event.workloadId,
    adapterId: event.adapterId, ...event.result }));
  const material = {
    schema: 'genos.qualification-campaign-dossier/v1', campaignId: config.campaignId,
    configHash: state.configHash, revision: config.revision, status: 'descriptive_complete',
    workloads, proofs: workloads.flatMap((item) => item.proofs),
    costs: summarizeCosts(workloads, config.costBudget),
    scientificPromotionAllowed: false, productionAllowed: false, promotionDecision: null
  };
  const dossier = { ...material, dossierHash: gate.digest(material) };
  return { ...dossier, activation: gate.evaluateActivation(dossier) };
}

function integrityFailure(reason) {
  return { dossier: null, activation: {
    schema: 'genos.campaign-activation-report/v1', status: 'failed', reason,
    productionAllowed: false, scientificPromotionAllowed: false, promotionDecision: null
  }, resumed: true };
}

async function runQualificationCampaign(options) {
  validateConfig(options.config, options.currentRevision);
  const configHash = gate.digest(options.config);
  let state = readState(options.outputPath);
  if (state && !validState(state)) return integrityFailure('CAMPAIGN_STATE_TAMPERED');
  if (state && (state.configHash !== configHash || state.revision !== options.config.revision)) {
    return integrityFailure('CAMPAIGN_CONFIGURATION_DRIFT');
  }
  if (state?.status === 'complete') {
    if (!gate.validDossierSeal(state.dossier)) return integrityFailure('CAMPAIGN_DOSSIER_TAMPERED');
    return { dossier: state.dossier, activation: state.dossier.activation, resumed: true };
  }
  if (!state) {
    state = initialState(options.config, configHash);
    writeState(options.outputPath, state);
  }
  state = await executePending(state, { ...options, configHash });
  const dossier = buildDossier(state, options.config);
  state = sealState({ ...state, status: 'complete', dossier });
  writeState(options.outputPath, state);
  return { dossier, activation: dossier.activation, resumed: false };
}

module.exports = { ALLOWED_OUTCOMES, validateConfig, runQualificationCampaign,
  validState, readState };
