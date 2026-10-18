'use strict';

/**
 * Boucle contrôlée de perception active.
 * Le plan choisit les sondes, l'appelant fournit l'exécuteur autorisé et
 * chaque observation est inscrite dans le sensorium avec sa provenance.
 */

const crypto = require('node:crypto');
const planner = require('./activePerceptionPlannerService');
const sensorium = require('./sensoriumService');
const { makeObservation } = require('./observationService');
const { EvidenceState, createEnvelope, promoteEnvelope } = require('../evidenceContractService');

async function runActivePerception(options = {}) {
  const input = options || {};
  if (!input.agentId) throw new Error('runActivePerception requires agentId');
  const planned = planner.planProbes({
    unknowns: input.unknowns,
    capabilities: input.capabilities,
    domain: input.domain,
    budget: input.budget
  });
  const state = sensorium.getSensorium(input.agentId)
    || sensorium.createSensorium({ agentId: input.agentId, attentionBudget: input.budget });
  sensorium.setFocus({ agentId: input.agentId, focus: planned.probes[0] || null });
  if (typeof input.executeProbe !== 'function') {
    return response({ input, plan: planned, receipts: [], decision: 'RequestCapability', reason: 'probe_executor_missing', state });
  }
  const receipts = [];
  for (const probe of planned.probes) {
    if (receipts.length >= (input.maxProbes || planned.probes.length)) break;
    receipts.push(await executeProbe(input, probe));
  }
  const decision = decide(receipts, planned.probes.length);
  return response({ input, plan: planned, receipts, decision, reason: null, state });
}

async function executeProbe(input, probe) {
  const startedAt = new Date().toISOString();
  const output = await probeOutput(input, probe);
  const verified = isVerified(output);
  const evidenceEnvelope = probeEvidence({ input, probe, output, verified });
  const observation = probeObservation({ input, probe, output, verified, evidenceEnvelope });
  sensorium.recordObservation({ agentId: input.agentId, observation });
  const receipt = { probe, startedAt, completedAt: new Date().toISOString(), verified,
    evidenceRef: output.evidenceRef || null, evidenceState: evidenceEnvelope.state, evidenceEnvelope,
    observationDigest: sensorium.observationDigest(observation),
    result: { status: output.status || (verified ? 'observed' : 'unverified') } };
  return { ...receipt, receiptDigest: digest(receipt) };
}

function probeEvidence({ input, probe, output, verified }) {
  const initialState = output.synthetic === true ? EvidenceState.SYNTHETIC : EvidenceState.OBSERVED;
  const envelope = createEnvelope({
    sourceId: probe.sensorId,
    captureId: `${input.agentId}:${probe.id || probe.target || 'probe'}`,
    input: { agentId: input.agentId, probe },
    output,
    state: initialState,
    replayKey: digest({ agentId: input.agentId, probe, output })
  });
  const observed = initialState === EvidenceState.SYNTHETIC
    ? promoteEnvelope(envelope, EvidenceState.OBSERVED)
    : envelope;
  if (!verified) return observed;
  return promoteEnvelope(observed, EvidenceState.VERIFIED, {
    verifierId: output.verifierId || 'probe-verifier',
    verificationRef: output.evidenceRef
  });
}

async function probeOutput(input, probe) {
  try {
    const result = await input.executeProbe(probe);
    return result && typeof result === 'object' ? result : { output: result };
  } catch (error) {
    return { status: 'failed', error: error.message || String(error) };
  }
}

function isVerified(output) {
  return output.verified === true && typeof output.evidenceRef === 'string';
}

function probeObservation(options) {
  const { input, probe, output, verified, evidenceEnvelope } = options;
  return makeObservation({
    sensorId: probe.sensorId, agentId: input.agentId, target: probe.target,
    uncertaintyBefore: output.uncertaintyBefore, uncertaintyAfter: output.uncertaintyAfter,
    evidenceState: evidenceEnvelope.state,
    evidenceRef: output.evidenceRef || null,
    data: { status: output.status || (verified ? 'observed' : 'unverified'), evidenceRef: output.evidenceRef || null,
      evidenceId: evidenceEnvelope.evidenceId }
  });
}

function decide(receipts, plannedCount) {
  if (!receipts.length) return 'RequestCapability';
  if (receipts.some(item => item.result.status === 'failed')) return 'Adapt';
  if (receipts.some(item => !item.verified)) return 'Escalate';
  return receipts.length < plannedCount ? 'Continue' : 'Terminate';
}

function response(options) {
  const { input, plan, receipts, decision, reason, state } = options;
  return {
    status: reason ? 'not_executed' : 'completed',
    claimable: receipts.length > 0 && receipts.every(item => item.evidenceState === EvidenceState.VERIFIED),
    agentId: input.agentId,
    plan: { probes: plan.probes, spent: plan.spent, sequence: plan.sequence },
    receipts, decision, reason,
    sensoriumRevision: state.revision,
    sensorium: sensorium.snapshotSensorium(input.agentId)
  };
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

module.exports = { runActivePerception };
