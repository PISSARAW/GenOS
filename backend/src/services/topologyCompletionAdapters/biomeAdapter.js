'use strict';

const { baseDossier, closureInput } = require('./dossier');
const stateReader = require('./biomeStateReader');
const { digest } = require('../evidenceContractService');
const { digest: biologicalDigest } = require('../biologicalIntegrity');
const goalOracle = require('../biome/contracts/goalVerificationReceipt');
const { withTransaction } = require('../../db');

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

function ecosystemLists(ecology) {
  if (!ecology?.environment || !Array.isArray(ecology.niches)
      || !Array.isArray(ecology.populations)) {
    return assessment('partial', 'biome_ecosystem_state_missing');
  }
  if (!ecology.niches.length || !ecology.populations.length) {
    return assessment('partial', 'biome_ecosystem_population_missing');
  }
  return assessment('verified');
}

function populationLinks(ecology) {
  const nicheIds = new Set(ecology.niches.map((niche) => niche.nicheId));
  const linked = ecology.populations.every((population) =>
    population.populationId && nicheIds.has(population.nicheId));
  if (!linked) return assessment('failed', 'biome_population_niche_mismatch');
  const individuals = ecology.populations.flatMap((population) => population.individuals || []);
  if (!individuals.length) return assessment('partial', 'biome_organisms_missing');
  return assessment('verified');
}

function organismPrograms(ecology) {
  const individuals = ecology.populations.flatMap((population) => population.individuals || []);
  const programmed = individuals.some((individual) => individual.cognitiveRecipe
    || Object.keys(individual.phenotype || {}).length)
    || ecology.populations.some((population) => (population.strategies || []).length
      || (population.cognitiveRecipes || []).length);
  return programmed ? assessment('verified')
    : assessment('partial', 'biome_organism_program_missing');
}

function topologyStructure(state) {
  const ecology = state.state.ecology;
  const lists = ecosystemLists(ecology);
  if (lists.status !== 'verified') return lists;
  const links = populationLinks(ecology);
  return links.status === 'verified' ? organismPrograms(ecology) : links;
}

function phaseAssessment(state) {
  const ecology = state.state.ecology;
  const runtime = ecology.ecologicalState?.runtime;
  if (!runtime || !Number.isSafeInteger(runtime.tick) || runtime.tick < 1
      || !Array.isArray(runtime.history) || !runtime.history.length) {
    return assessment('partial', 'biome_ecological_phase_missing');
  }
  const last = runtime.history.at(-1);
  if (last?.tick !== runtime.tick || ecology.tick !== runtime.tick) {
    return assessment('failed', 'biome_ecological_phase_inconsistent');
  }
  return assessment('verified');
}

function availableEvidence(base) {
  return base.roster.evidenceProofs.map((proof) => proof.reference).filter(Boolean);
}

function terminalAssessment(base, state) {
  const ecology = state.state.ecology;
  const runtime = ecology.ecologicalState.runtime;
  const goal = runtime.goalVerification;
  if (!goal) return assessment('partial', 'biome_goal_oracle_missing');
  const oracleIssue = independentGoalAssessment({ base, state, runtime, goal });
  if (oracleIssue) return oracleIssue;
  const stateIssue = goalStateAssessment(goal, state, runtime);
  if (stateIssue) return stateIssue;
  if (runtime.stopCondition !== 'goal_achieved' || ecology.status !== 'completed') {
    return assessment('failed', 'biome_terminal_state_inconsistent');
  }
  return assessment('verified');
}

function goalStateAssessment(goal, state, runtime) {
  if (goal.sessionId !== state.sessionId || goal.tick !== runtime.tick) {
    return assessment('failed', 'biome_goal_oracle_scope_mismatch');
  }
  const evidence = Array.isArray(goal.evidenceRefs)
    && goal.evidenceRefs.some((ref) => typeof ref === 'string' && ref.trim());
  return goal.verified === true && evidence
    ? null : assessment('partial', 'biome_goal_oracle_unverified');
}

function independentGoalAssessment(context) {
  const { base, state, runtime, goal } = context;
  const ecology = state.state.ecology;
  const measurements = runtime.history.at(-1)?.measurements || null;
  const oracle = goalOracle.assess(goal.oracleReceipt, { missionId: base.missionId,
    producerId: base.producerId, sessionId: state.sessionId, tick: runtime.tick,
    evidenceRefs: availableEvidence(base), measurements,
    health: ecology.ecologicalState.health, verified: goal.verified,
    stopCondition: runtime.stopCondition, status: ecology.status });
  if (oracle.verified) return null;
  const partial = ['biome_goal_oracle_receipt_missing',
    'biome_goal_oracle_evidence_missing'].includes(oracle.reason);
  return assessment(partial ? 'partial' : 'failed', oracle.reason);
}

function fitnessReceipts(ecology) {
  return ecology.populations.flatMap((population) => (population.individuals || [])
    .flatMap((individual) => individual.fitnessReceipts || []));
}

function fitnessAssessment(state) {
  const ecology = state.state.ecology;
  const receipts = fitnessReceipts(ecology);
  if (!receipts.length) return assessment('partial', 'biome_fitness_evidence_missing');
  const resultIds = new Set(ecology.ecologicalState.runtime.resultIds || []);
  const archiveIds = new Set((ecology.archive || []).map((entry) => entry.id));
  const valid = receipts.every((receipt) => Number.isFinite(receipt.score)
    && resultIds.has(receipt.resultId) && archiveIds.has(receipt.resultId)
    && Array.isArray(receipt.evidenceRefs) && receipt.evidenceRefs.length > 0);
  return valid ? assessment('verified')
    : assessment('failed', 'biome_fitness_evidence_inconsistent');
}

function validAdaptation(ecology, item) {
  const population = ecology.populations.find((entry) => entry.populationId === item.populationId);
  return Boolean(population?.individuals?.some((entry) => entry.individualId === item.individualId)
    && item.patch && Object.keys(item.patch).length
    && Array.isArray(item.evidenceRefs) && item.evidenceRefs.length > 0);
}

function validExecution(execution) {
  return execution.status === 'verified' && execution.outputDigest
    && Array.isArray(execution.evidenceRefs) && execution.evidenceRefs.length > 0;
}

function adaptationAssessment(state) {
  const ecology = state.state.ecology;
  const adaptations = ecology.ecologicalState.phenotypeAdaptations || [];
  if (adaptations.length) {
    return adaptations.every((item) => validAdaptation(ecology, item))
      ? assessment('verified') : assessment('failed', 'biome_adaptation_evidence_inconsistent');
  }
  const executions = Object.values(ecology.ecologicalState.runtime.executions || {});
  if (executions.some(validExecution)) return assessment('verified');
  return assessment('partial', 'biome_adaptation_evidence_missing');
}

function proofContent(base, reference) {
  return base.roster.evidenceProofs.find((proof) => proof.reference === reference);
}

function runIdentity(content = {}) {
  return { workerId: content.workerId || content.memberId || content.correlation?.agentId,
    missionId: content.missionId || content.correlation?.missionId,
    runId: content.runId || content.executionRunId || content.correlation?.runId };
}

function validRunIdentity(identity, base, member) {
  return identity.workerId === member.memberId
    && identity.missionId === base.missionId && Boolean(identity.runId);
}

function assessedRunProof(base, member, reference) {
  const proof = proofContent(base, reference);
  const content = proof?.content;
  if (!content) return assessment('partial', 'biome_worker_run_proof_missing');
  const expectedReference = `sha256:${biologicalDigest(content)}`;
  const valid = proof.source === 'biological_worker_receipts'
    && expectedReference === reference
    && validRunIdentity(runIdentity(content), base, member);
  return valid ? assessment('verified')
    : assessment('failed', 'biome_worker_run_proof_invalid');
}

function runProofAssessment(base) {
  for (const member of base.roster.members) {
    if (!Array.isArray(member.evidenceRefs) || !member.evidenceRefs.length) {
      return assessment('partial', 'biome_worker_run_proof_missing');
    }
    for (const reference of member.evidenceRefs) {
      const checked = assessedRunProof(base, member, reference);
      if (checked.status !== 'verified') return checked;
    }
  }
  return assessment('verified');
}

function oracleReceipt(base, state) {
  const runtime = state.state.ecology.ecologicalState.runtime;
  const goal = runtime.goalVerification;
  return { schema: 'genos.biome-completion-oracle/v1', missionId: base.missionId,
    sessionId: state.sessionId, revision: state.revision, tick: runtime.tick,
    producerId: base.producerId, verifierDigest: goal.oracleReceipt.verifierDigest,
    goalVerificationHash: digest(goal),
    goalOracleAttestation: goal.oracleReceipt.signedReceipt.signature,
    canonicalStateHash: digest(state.state), eventJournalHash: digest(state.events),
    workerRunIds: base.roster.evidenceProofs.map((proof) =>
      proof.content?.runId || proof.content?.executionRunId).filter(Boolean) };
}

function verifiedDossier(base, state) {
  const goal = state.state.ecology.ecologicalState.runtime.goalVerification;
  const refs = goal.oracleReceipt.evidenceRefs;
  const receipt = oracleReceipt(base, state);
  return { ...base, lifecycleState: 'completed', producerId: base.missionId,
    stateSeal: state.seal,
    topologyValidation: { status: 'verified', reasons: [] },
    invariants: [
      { id: 'biome_mission_run_scope', passed: true, sessionId: state.sessionId },
      { id: 'biome_ecosystem_organisms_programs', passed: true },
      { id: 'biome_adaptation_and_fitness', passed: true },
      { id: 'biome_terminal_goal_verification', passed: true, tick: receipt.tick },
      { id: 'biome_event_journal_integrity', passed: true, revision: state.revision }
    ],
    oracle: { status: 'verified', independent: true,
      verifierIds: [goal.oracleReceipt.verifierDigest], evidenceRefs: refs,
      receipt, receiptHash: digest(receipt) } };
}

async function build(input = {}) {
  const base = baseDossier(input);
  const state = await stateReader.read({ db: input.context?.db,
    missionId: base.missionId, context: input.context, evidence: input.evidence });
  if (state.status === 'failed') return failed(base, state.reason, state);
  if (state.status !== 'read') return incomplete(base, state.reason);
  const checks = [topologyStructure(state), phaseAssessment(state), runProofAssessment(base),
    terminalAssessment(base, state), fitnessAssessment(state), adaptationAssessment(state)];
  const issue = checks.find((check) => check.status !== 'verified');
  if (issue?.status === 'failed') return failed(base, issue.reason, state);
  if (issue) return incomplete(base, issue.reason);
  return verifiedDossier(base, state);
}

async function finalize(context = {}) {
  const db = context.input?.context?.db;
  return withTransaction(db, async () => {
    let dossier = context.dossier;
    if (dossier?.topologyValidation?.status === 'verified') {
      const current = await stateReader.revalidate({ db, seal: dossier.stateSeal });
      if (current.status !== 'verified') {
        dossier = failed(dossier, current.reason || 'biome_completion_snapshot_changed', {
          sessionId: dossier.stateSeal?.sessionId });
      }
    }
    return context.closeMission(closureInput(dossier));
  });
}

async function close(input = {}, closeMission) {
  return finalize({ input, closeMission, dossier: await build(input) });
}

module.exports = Object.freeze({ id: 'biome-completion-v1', topology: 'biome',
  specialized: true, build, close, finalize });
