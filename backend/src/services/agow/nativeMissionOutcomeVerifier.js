'use strict';

const store = require('../biologicalWorkerStore');
const gate = require('../epistemic/nativeOracleGate');
const proofs = require('../epistemic/nativeOracleProof');
const { digest } = require('../biologicalIntegrity');
const observationContract = require('./missionObservationContract');
const MEASUREMENT_CONTRACT = 'genos.agow.native-subset-outcome/v1';

function supports(mission) {
  if (!require('../agents/workerRuntimeLimitsService').isDeterministicWorkerMission(mission)) return false;
  const method = mission.methodContract || mission.workerContract?.mission?.methodContract;
  if (method?.methodId === 'subset_sum') return mission.workerKind === 'procedural_executor';
  return ['scoped_procedure', 'host_procedure', 'niche_procedure'].includes(method?.methodId)
    && method.parameters?.procedure?.methodId === 'subset_sum';
}

function forBinding(input) {
  if (input.binding.measurementContract !== MEASUREMENT_CONTRACT) return null;
  return (request) => verify({ ...request, db: input.db });
}

async function recordedTerminal(db, input) {
  const records = await store.observations(db, input.binding.runId);
  if (!records.length || records.some((record) => !record.applied)) throw new Error('agow-native-observations-unapplied');
  const terminals = records.filter((record) => record.event.eventType === 'AGENT_COMPLETED');
  if (terminals.length !== 1) throw new Error('agow-native-single-terminal-required');
  const terminal = terminals[0];
  const identity = observationContract.eventIdentity(terminal.event, input.binding);
  if (identity.eventId !== input.eventIdentity.eventId || identity.eventDigest !== input.eventIdentity.eventDigest) {
    throw new Error('agow-native-terminal-mismatch');
  }
  return { terminal, records };
}

async function acceptedRun(db, binding) {
  const run = await db.get('SELECT * FROM strategy_execution_runs WHERE id=? AND agent_id=?', binding.runId, binding.agentId);
  if (run?.status !== 'completed' || run.guardrail_reason) {
    throw new Error('agow-native-completed-run-required');
  }
  const sealed = await store.binding(db, run.id);
  const receipt = await store.receipt(db, run.id);
  validateReceipt({ binding, sealed, receipt });
  return { run, sealed, receipt };
}

function validateReceipt(input) {
  const { binding, sealed, receipt } = input;
  if (sealed?.workerId !== binding.agentId || sealed.missionId !== binding.missionId || sealed.runId !== binding.runId) {
    throw new Error('agow-native-owner-mismatch');
  }
  if (receipt?.bindingHash !== digest(sealed) || receipt.runId !== binding.runId
    || receipt.result?.verified !== true || receipt.budgetAssessment?.satisfied !== true) {
    throw new Error('agow-native-verified-receipt-required');
  }
}

async function verify(input) {
  if (input.binding.measurementContract !== MEASUREMENT_CONTRACT) throw new Error('agow-native-metric-contract-required');
  const accepted = await acceptedRun(input.db, input.binding);
  const { terminal, records } = await recordedTerminal(input.db, input);
  if (digest(records.map((record) => record.hash)) !== digest(accepted.receipt.evidence.observations)) {
    throw new Error('agow-native-observation-chain-mismatch');
  }
  const request = { runId: input.binding.runId, agentId: input.binding.agentId };
  const verification = await gate.historical(input.db, { ...request, event: terminal.event });
  validateAcceptance(verification, accepted.receipt);
  await proofs.assertCompletedEvidence(input.db, { proof: verification.proof, request,
    report: terminal.event.payload.evidenceReport });
  return measuredOutcome(input, verification);
}

function validateAcceptance(verification, receipt) {
  const attestation = verification?.proof?.attestation;
  if (attestation?.value.domain !== 'subset_sum' || attestation.value.accepted !== true
    || verification.acceptance.value.status !== 'completed') throw new Error('agow-native-subset-acceptance-required');
  if (receipt.semanticVerification?.hash !== attestation.hash
    || receipt.semanticVerification.acceptanceHash !== verification.acceptance.hash) {
    throw new Error('agow-native-semantic-reference-mismatch');
  }
}

function measuredOutcome(input, verification) {
  const proof = verification.proof;
  const verifierId = require('../verifierTrustRegistry').ensureVerifier('procedure_semantic').digest;
  return { verified: true, verifierId, bindingHash: input.binding.bindingHash,
    eventDigest: input.eventIdentity.eventDigest,
    evidenceRefs: [proof.attestation.eventId, proof.attestation.hash,
      verification.acceptance.eventId, verification.acceptance.hash,
      ...proof.saved.evaluation.assembly.verifications.map((receipt) => `verifier-nonce:${receipt.nonce}`)],
    metrics: { realizedLoss: 0, goalProgress: 1, resourceReserve: null,
      missionStability: null, blockageEvents: null, viabilityViolations: null } };
}

async function observeProgress(db, input) {
  if (require('../globalWorkspaceService').getMode() === 'off') return null;
  if (!require('../agentTerminalStatusService').isTerminalEvent(input.event.eventType)) return null;
  const runId = input.event.payload?.executionRunId;
  const agentId = input.mission.agentId;
  const observations = require('./missionObservationService');
  const record = (await observations.list({ db, agentId })).find((item) => item.binding.runId === runId);
  if (record?.binding.measurementContract !== MEASUREMENT_CONTRACT) return null;
  const events = await store.observations(db, runId);
  const canonical = events.find((item) => item.event.id === input.event.id && item.applied);
  return observations.observe({ db, agentId, runId, event: canonical?.event || input.event });
}

module.exports = { MEASUREMENT_CONTRACT, supports, forBinding, verify, observeProgress };
