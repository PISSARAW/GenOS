'use strict';

const { baseDossier } = require('./dossier');
const stateReader = require('./rhizomeStateReader');
const { digest } = require('../evidenceContractService');

const HASH = /^[a-f0-9]{64}$/;

function assessment(status, reason) {
  return { status, ...(reason ? { reason } : {}) };
}

function incomplete(base, reason) {
  return { ...base, lifecycleState: 'completed', topologyValidation: {
    status: 'partial', reasons: [reason] }, invariants: [], oracle: null };
}

function failed(base, reason, state = {}) {
  return { ...base, lifecycleState: 'completed', topologyValidation: {
    status: 'failed', reasons: [reason] }, invariants: [{ id: reason, passed: false,
    sessionId: state.sessionId || null }], oracle: null };
}

function branchAssessment(base, state) {
  const branches = state.output.branches;
  if (!Array.isArray(branches) || !branches.length) {
    return assessment('partial', 'rhizome_branches_missing');
  }
  if (branches.some((branch) => !branch.workerId || !branch.role || !branch.answer)) {
    return assessment('partial', 'rhizome_branch_synthesis_missing');
  }
  if (branches.some((branch) => branch.status !== 'completed')) {
    return assessment('failed', 'rhizome_branch_not_completed');
  }
  const branchIds = branches.map((branch) => branch.workerId);
  if (new Set(branchIds).size !== branchIds.length
      || !sameSet(branchIds, base.roster.requiredMemberIds)) {
    return assessment('failed', 'rhizome_branch_roster_mismatch');
  }
  return assessment('verified');
}

function canonicalGraph(graph) {
  return { graphVersion: graph.graphVersion,
    nodes: [...(graph.nodes || [])].sort((left, right) =>
      left.nodeId.localeCompare(right.nodeId)),
    edges: [...(graph.edges || [])].sort((left, right) =>
      left.edgeId.localeCompare(right.edgeId)) };
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function graphAssessment(state) {
  const output = state.output;
  if (!output.graph || !Array.isArray(output.graph.nodes)
      || !Array.isArray(output.graph.edges)) {
    return assessment('partial', 'rhizome_graph_projection_missing');
  }
  if (digest(canonicalGraph(output.graph)) !== digest(canonicalGraph(state.graph))) {
    return assessment('failed', 'rhizome_graph_projection_mismatch');
  }
  const eventIds = new Set(output.branches.map((branch) => branch.evidenceEventId)
    .filter(Boolean).map((id) => `telemetry-event:${id}`));
  const provenance = state.graph.nodes.flatMap((node) => node.provenance || []);
  if (!eventIds.size || !provenance.some((ref) => eventIds.has(ref))) {
    return assessment('partial', 'rhizome_branch_graph_provenance_missing');
  }
  if (provenance.some((ref) => ref.startsWith('telemetry-event:') && !eventIds.has(ref))) {
    return assessment('failed', 'rhizome_branch_graph_provenance_mismatch');
  }
  return assessment('verified');
}

function phaseAssessment(state) {
  if (state.output.status === 'failed') {
    return assessment('failed', 'rhizome_terminal_phase_failed');
  }
  if (state.output.status !== 'completed' || state.output.complete !== true) {
    return assessment('partial', 'rhizome_terminal_phase_missing');
  }
  const types = new Set(state.events.map((event) => event.type));
  if (!types.has('NODE_DISCOVERED')) {
    return assessment('partial', 'rhizome_discovery_phase_missing');
  }
  if (Number(state.output.graphVersion) !== state.graph.graphVersion) {
    return assessment('failed', 'rhizome_terminal_graph_version_mismatch');
  }
  return assessment('verified');
}

function dependencyAssessment(state) {
  const unresolved = state.output.unexploredDependencies;
  if (!Array.isArray(unresolved)) {
    return assessment('partial', 'rhizome_dependency_assessment_missing');
  }
  return unresolved.length
    ? assessment('partial', 'rhizome_dependencies_unresolved') : assessment('verified');
}

function synthesisAssessment(state) {
  const expected = state.output.branches
    .map((branch) => `## ${branch.role}\n${branch.answer}`).join('\n\n');
  if (!state.output.answer) return assessment('partial', 'rhizome_synthesis_missing');
  return state.output.answer === expected ? assessment('verified')
    : assessment('failed', 'rhizome_synthesis_mismatch');
}

function proofIndex(base) {
  return new Map(base.roster.evidenceProofs.map((proof) => [proof.reference, proof]));
}

function proofIdentity(content = {}) {
  return { workerId: content.workerId || content.memberId || content.correlation?.agentId,
    missionId: content.missionId || content.correlation?.missionId,
    runId: content.runId || content.executionRunId || content.correlation?.runId };
}

function referenceAssessment(input) {
  const proof = input.index.get(input.reference);
  if (!proof?.content) return assessment('partial', 'rhizome_worker_run_proof_missing');
  const identity = proofIdentity(proof.content);
  const valid = proof.source === 'biological_worker_receipts'
    && digest(proof.content) === input.reference
    && identity.workerId === input.memberId
    && identity.missionId === input.missionId && Boolean(identity.runId)
    && proof.content.result?.status === 'completed'
    && proof.content.result?.verified === true;
  return valid ? assessment('verified')
    : assessment('failed', 'rhizome_worker_run_proof_invalid');
}

function proofAssessment(base, state) {
  if (state.runs.length !== base.roster.evidenceProofs.length) {
    return assessment('failed', 'rhizome_worker_run_scope_mismatch');
  }
  const index = proofIndex(base);
  for (const member of base.roster.members) {
    if (!Array.isArray(member.evidenceRefs) || !member.evidenceRefs.length) {
      return assessment('partial', 'rhizome_worker_run_proof_missing');
    }
    for (const reference of member.evidenceRefs) {
      const checked = referenceAssessment({ index, reference,
        memberId: member.memberId, missionId: base.missionId });
      if (checked.status !== 'verified') return checked;
    }
  }
  return assessment('verified');
}

function oracleReference(content = {}) {
  return content.semanticVerification || null;
}

function oracleAssessment(base) {
  const proofs = base.roster.evidenceProofs;
  const references = proofs.map((proof) => oracleReference(proof.content));
  if (references.some((reference) => !reference)) {
    return assessment('partial', 'rhizome_independent_oracle_missing');
  }
  const valid = references.every((reference) =>
    reference.schema === 'genos.native-oracle-receipt-reference/v1'
    && HASH.test(reference.hash || '') && HASH.test(reference.acceptanceHash || '')
    && reference.budgetAssessment?.satisfied === true);
  return valid ? assessment('verified')
    : assessment('failed', 'rhizome_independent_oracle_invalid');
}

function oracleReceipt(base, state) {
  const oracleRefs = base.roster.evidenceProofs.map((proof) =>
    oracleReference(proof.content));
  return { schema: 'genos.rhizome-completion-oracle/v1', missionId: base.missionId,
    rhizomeId: state.sessionId, revision: state.revision,
    graphVersion: state.graph.graphVersion,
    canonicalStateHash: digest(state.session), graphHash: digest(state.graph),
    eventJournalHash: digest(state.events), synthesisHash: digest(state.output.answer),
    runIds: base.roster.evidenceProofs.map((proof) => proofIdentity(proof.content).runId),
    nativeOracleHashes: oracleRefs.map((reference) => reference.hash) };
}

function verifiedDossier(base, state) {
  const receipt = oracleReceipt(base, state);
  const refs = base.roster.evidenceProofs.map((proof) => proof.reference);
  const verifierIds = [...new Set(base.roster.evidenceProofs.map((proof) =>
    `native-oracle:${oracleReference(proof.content).hash}`))];
  return { ...base, lifecycleState: 'completed', producerId: base.missionId,
    topologyValidation: { status: 'verified', reasons: [] }, barrierStatus: 'complete',
    invariants: [
      { id: 'rhizome_mission_run_scope', passed: true, sessionId: state.sessionId },
      { id: 'rhizome_branches_and_stigmergic_graph', passed: true,
        graphVersion: state.graph.graphVersion },
      { id: 'rhizome_discovery_dependencies_resolved', passed: true },
      { id: 'rhizome_synthesis_validated', passed: true },
      { id: 'rhizome_native_oracle_receipts', passed: true }
    ], oracle: { status: 'verified', independent: true, verifierIds,
      evidenceRefs: refs, receipt, receiptHash: digest(receipt) } };
}

async function build(input = {}) {
  const base = baseDossier(input);
  const state = await stateReader.read({ db: input.context?.db,
    missionId: base.missionId, context: input.context, evidence: input.evidence });
  if (state.status === 'failed') return failed(base, state.reason, state);
  if (state.status !== 'read') return incomplete(base, state.reason);
  const checks = [branchAssessment(base, state), graphAssessment(state),
    phaseAssessment(state), dependencyAssessment(state), synthesisAssessment(state),
    proofAssessment(base, state), oracleAssessment(base)];
  const issue = checks.find((check) => check.status !== 'verified');
  if (issue?.status === 'failed') return failed(base, issue.reason, state);
  if (issue) return incomplete(base, issue.reason);
  return verifiedDossier(base, state);
}

module.exports = Object.freeze({ id: 'rhizome-completion-v1', topology: 'rhizome',
  specialized: true, build });
