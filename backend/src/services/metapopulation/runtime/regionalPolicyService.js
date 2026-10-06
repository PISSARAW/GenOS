'use strict';

const { withTransaction } = require('../../../db');
const store = require('../metapopulationStore');
const { detectSpeciation } = require('../evolution/evolutionaryRuntimeService');
const federation = require('../policy/federatedRuntimeService');

const EVENT_ACTIONS = Object.freeze({
  TRIGGER_ISLAND_MIGRATION: 'ISLAND_MIGRATION_TRIGGERED',
  TRIGGER_STEPPING_STONE_MIGRATION: 'STEPPING_STONE_MIGRATION_TRIGGERED',
  PROTECT_SOURCE: 'SOURCE_PROTECTED',
  RECOVERY_SLA_BREACH: 'RECOVERY_SLA_BREACH',
  DIVERSITY_FLOOR_BREACH: 'DIVERSITY_FLOOR_BREACH',
  ALLOW_CONTROLLED_EXTINCTION: 'CONTROLLED_EXTINCTION_AUTHORIZED',
  PROTECT_FROM_EXTINCTION: 'EXTINCTION_PROTECTION_SET',
  REJECT_FEDERATED_TRANSFER: 'FEDERATED_TRANSFER_REJECTED',
  REDACT_PROPAGULE: 'PROPAGULE_REDACTION_REQUESTED',
  REQUIRE_SOVEREIGNTY_ACKNOWLEDGMENT: 'SOVEREIGNTY_ACKNOWLEDGMENT_REQUIRED',
  REQUIRE_RECEIVER_ATTESTATION: 'RECEIVER_ATTESTATION_REQUIRED',
  CHECK_SPECIATION: 'SPECIATION_ASSESSED',
  PROOF_OF_DATA_MINIMIZATION: 'DATA_MINIMIZATION_PROOF'
});

const POLICY_FLAGS = Object.freeze({
  PROTECT_SOURCE: { protectedFromCull: true, sourceProtected: true },
  PROTECT_FROM_EXTINCTION: { protectedFromCull: true, allowedExtinction: false },
  ALLOW_CONTROLLED_EXTINCTION: { allowedExtinction: true },
  REQUIRE_SOVEREIGNTY_ACKNOWLEDGMENT: { sovereigntyAcknowledgmentRequired: true }
});

async function executePolicyAction(action, context) {
  if (!EVENT_ACTIONS[action.type]) return null;
  if (!context.options.db) return { type: action.type, recorded: false, reason: 'NO_DB' };
  const receipt = await policyReceipt(action, context);
  const { db } = context.options;
  const metapopulationId = context.input.metapopulationId;
  return withTransaction(db, async () => {
    if (POLICY_FLAGS[action.type]) await persistDemePolicy({ db, metapopulationId, action });
    const event = await store.appendEvent(db, metapopulationId, { type: EVENT_ACTIONS[action.type],
      payload: { ...receipt, actionType: action.type }, actor: context.input.actor || 'metapopulation-runtime',
      occurredAt: new Date().toISOString(), provenance: { source: 'regionalPolicyService' } });
    return { type: action.type, ...receipt, recorded: true, eventRevision: event.revision };
  });
}

async function persistDemePolicy(context) {
  const { db, metapopulationId, action } = context;
  if (!await store.getDeme(db, metapopulationId, action.demeId)) throw policyError('METAPOPULATION_DEME_UNKNOWN');
  const session = await store.loadSession(db, metapopulationId);
  const memory = session.regionalMemory;
  const policies = { ...memory.demePolicies };
  policies[action.demeId] = { ...policies[action.demeId], ...POLICY_FLAGS[action.type] };
  await db.run('UPDATE metapopulation_sessions SET regional_memory_json = ? WHERE id = ?',
    JSON.stringify({ ...memory, demePolicies: policies }), metapopulationId);
}

async function policyReceipt(action, context) {
  if (action.type === 'CHECK_SPECIATION') {
    return { demeA: action.demeA, demeB: action.demeB, ...detectSpeciation(action) };
  }
  if (action.type === 'PROOF_OF_DATA_MINIMIZATION') return minimizationReceipt(action, context);
  const { type, ...payload } = action;
  return payload;
}

function minimizationReceipt(action, context) {
  const candidate = (context.input.migrationCandidates || []).find((item) => item.propaguleId === action.propaguleId);
  const authorization = candidate && federation.authorizeFederatedTransfer({ propagule: candidate,
    sourceRegion: candidate.sourceRegion, targetRegion: candidate.targetRegion,
    contracts: context.input.crossRegionContracts });
  if (!authorization?.allowed || authorization.proof.proofId !== action.proofId) {
    throw policyError('METAPOPULATION_MINIMIZATION_PROOF_INVALID');
  }
  return { propaguleId: action.propaguleId, proofId: action.proofId, contractId: authorization.contractId,
    proof: authorization.proof, proven: true };
}

async function verifyPolicyAction(context) {
  const { item, expected, db, metapopulationId } = context;
  if (!item.recorded || !Number.isSafeInteger(item.eventRevision)) return false;
  const events = await store.listEvents(db, metapopulationId);
  const event = events.find((entry) => entry.revision === item.eventRevision);
  if (event?.type !== EVENT_ACTIONS[expected.type] || event.payload.actionType !== expected.type) return false;
  if (!sameScope(event.payload, expected)) return false;
  if (!POLICY_FLAGS[expected.type]) return true;
  const session = await store.loadSession(db, metapopulationId);
  const flags = session.regionalMemory.demePolicies?.[expected.demeId];
  return Object.entries(POLICY_FLAGS[expected.type]).every(([name, value]) => flags?.[name] === value);
}

function sameScope(payload, action) {
  const names = ['demeId', 'propaguleId', 'proofId', 'interval', 'currentDiversity', 'reason', 'demeA', 'demeB'];
  return names.every((name) => action[name] === undefined || JSON.stringify(payload[name]) === JSON.stringify(action[name]));
}

function policyError(code) { return Object.assign(new Error(code), { code }); }

module.exports = { EVENT_ACTIONS, executePolicyAction, verifyPolicyAction };
