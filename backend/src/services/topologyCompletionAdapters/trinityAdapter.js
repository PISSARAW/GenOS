'use strict';

const { baseDossier } = require('./dossier');
const stateReader = require('./trinityStateReader');
const { digest } = require('../evidenceContractService');

function incomplete(base, reason) {
  return { ...base, lifecycleState: 'completed', topologyValidation: {
    status: 'partial', reasons: [reason] }, invariants: [], oracle: null };
}

function failed(base, reason, state) {
  return { ...base, lifecycleState: 'completed', topologyValidation: {
    status: 'failed', reasons: [reason] }, invariants: [{ id: reason, passed: false,
    experimentId: state?.experiment?.id || null }], oracle: null };
}

function evidenceReferences(base) {
  return (base.roster.evidenceProofs || []).map((proof) => proof.reference).filter(Boolean);
}

function oracleReceipt(base, state) {
  const promoted = state.worlds.find((world) => world.status === 'promoted');
  const terminal = state.transitions.at(-1);
  return { schema: 'genos.trinity-completion-oracle/v1', missionId: base.missionId,
    experimentId: state.experiment.id, variant: state.variant,
    comparisonInputHash: state.comparisonProof.inputHash,
    promotedWorld: promoted.world_number, promotedWorkerId: promoted.agent_id,
    candidateObjectId: state.decision.agentGit.objectId,
    promotionEvidenceRef: terminal.evidence_ref,
    runs: state.runs };
}

function verifiedDossier(base, state) {
  const refs = evidenceReferences(base);
  if (!refs.length) return incomplete(base, 'trinity_worker_evidence_missing');
  const receipt = oracleReceipt(base, state);
  const terminal = state.transitions.at(-1);
  return { ...base, lifecycleState: 'completed', producerId: base.missionId,
    topologyValidation: { status: 'verified', reasons: [] },
    invariants: [
      { id: 'trinity_mission_scope', passed: true, experimentId: state.experiment.id },
      { id: 'trinity_world_run_bindings', passed: true,
        runIds: state.runs.map((item) => item.runId) },
      { id: 'trinity_comparison_journal', passed: true,
        inputHash: state.comparisonProof.inputHash },
      { id: 'trinity_promotion_trace', passed: true,
        evidenceRef: terminal.evidence_ref },
      { id: 'trinity_signed_candidate', passed: true,
        objectId: state.decision.agentGit.objectId }
    ],
    oracle: { status: 'verified', independent: true,
      verifierIds: [`trinity-comparison:${state.comparisonProof.inputHash}`,
        `trinity-promotion:${terminal.actor}`,
        `agent-git:${state.decision.agentGit.objectId}`],
      evidenceRefs: refs, receipt, receiptHash: digest(receipt) } };
}

async function build(input = {}) {
  const base = baseDossier(input);
  const state = await stateReader.read({ db: input.context?.db,
    missionId: base.missionId, context: input.context, evidence: input.evidence });
  if (state.status === 'failed') return failed(base, state.reason, state);
  if (state.status !== 'read') return incomplete(base, state.reason);
  return verifiedDossier(base, state);
}

module.exports = Object.freeze({ id: 'trinity-completion-v1', topology: 'trinity',
  specialized: true, build });
