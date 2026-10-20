'use strict';

const agentGit = require('../agentGitService');
const biologicalIntegrity = require('../biologicalIntegrity');
const comparisonJournal = require('../trinityNominalComparisonJournal');
const qualification = require('../trinityNominalQualification');

const TERMINAL_FAILURES = new Set(['rejected', 'escalated', 'promotion_failed']);
const INTEGRITY_REASONS = new Set([
  'variant_selection_mismatch', 'variant_design_mismatch', 'sealed_baseline_mismatch',
  'isolated_worlds_not_observed', 'initial_reports_comparison_mismatch',
  'initial_reports_worlds_mismatch',
  'promoted_world_not_in_comparison', 'variant_gates_not_durable'
]);

function result(status, reason, state = {}) {
  return { status, reason, ...state };
}

function parse(value) {
  try { return { valid: true, value: JSON.parse(value || '{}') }; }
  catch (_) { return { valid: false, value: {} }; }
}

function requestedExperiment(context = {}) {
  return context.trinityExperimentId
    || context.output?.experimentId || context.output?.trinityExperimentId || null;
}

async function locate(db, missionId, context) {
  const explicit = requestedExperiment(context);
  let experiment;
  if (explicit) {
    experiment = await db.get(`SELECT id, mission_id, mission_snapshot_hash, status, decision_json
      FROM trinity_experiments WHERE id = ?`, explicit);
  } else {
    const matches = await db.all(`SELECT id, mission_id, mission_snapshot_hash, status, decision_json
      FROM trinity_experiments WHERE mission_id = ? ORDER BY id LIMIT 2`, missionId);
    if (matches.length > 1) return result('partial', 'trinity_experiment_ambiguous');
    [experiment] = matches;
  }
  if (!experiment) return result('partial', 'trinity_experiment_missing');
  if (experiment.mission_id !== missionId) {
    return result('failed', 'trinity_mission_scope_mismatch', { experiment });
  }
  return result('located', null, { experiment });
}

function signedCandidate(object, experiment, decision) {
  if (!object || !agentGit.verifyObjectSignature(object)) return false;
  const metadata = agentGit.json(object.metadata_json, {});
  return metadata.experimentId === experiment.id
    && metadata.worldNumber === decision.worldNumber
    && metadata.contentHash === decision.verification?.contentHash
    && metadata.candidateWorkspaceId === decision.artifact?.candidateWorkspaceId
    && object.commit_hash === decision.agentGit?.commitHash;
}

async function readCanonicalState(db, missionId, experiment) {
  const decision = parse(experiment.decision_json);
  if (!decision.valid) return result('failed', 'trinity_decision_integrity_failed');
  const [dispatch, worlds, transitions, comparisonProof, initialProof] = await Promise.all([
    db.get('SELECT variant_selection_json FROM trinity_dispatch_configs WHERE mission_id = ?', missionId),
    db.all(`SELECT world_number, agent_id, status, snapshot_hash, workspace_root
      FROM trinity_worlds WHERE experiment_id = ? ORDER BY world_number`, experiment.id),
    db.all(`SELECT from_status, to_status, actor, evidence_ref
      FROM trinity_experiment_transitions WHERE experiment_id = ? ORDER BY id`, experiment.id),
    comparisonJournal.read(db, missionId), comparisonJournal.readInitial(db, missionId)
  ]);
  const selection = parse(dispatch?.variant_selection_json);
  if (dispatch && !selection.valid) return result('failed', 'trinity_variant_selection_invalid');
  const variant = selection.value.variant || selection.value.selectedPreset || null;
  if (!variant) return result('partial', 'trinity_variant_selection_missing');
  const objectId = decision.value.agentGit?.objectId;
  const object = objectId
    ? await db.get('SELECT * FROM agent_git_objects WHERE id = ?', objectId) : null;
  const signedObjectValid = signedCandidate(object, experiment, decision.value);
  return result('read', null, { experiment, decision: decision.value, dispatch, worlds,
    transitions, comparisonProof, initialProof, variant, object, signedObjectValid });
}

function initialWorlds(state) {
  const expected = state.variant === 'factorial' ? 16 : 3;
  return state.worlds.filter((world) => world.world_number >= 1
    && world.world_number <= expected);
}

function proofFor(input, workerId) {
  const member = input.evidence?.members?.find((item) =>
    (item.memberId || item.workerId) === workerId);
  const references = Array.isArray(member?.evidenceRefs) ? member.evidenceRefs : [];
  if (references.length !== 1) return null;
  return input.evidence?.evidenceProofs?.find((proof) => proof.reference === references[0]) || null;
}

async function runRow(db, runId) {
  return db.get(`SELECT b.run_id, b.mission_id, b.agent_id, b.binding_hash, b.binding_json,
    r.agent_id AS run_agent_id, r.status AS run_status,
    br.mission_id AS receipt_mission_id, br.payload_hash, br.receipt_json
    FROM biological_worker_bindings b
    JOIN strategy_execution_runs r ON r.id = b.run_id
    LEFT JOIN biological_worker_receipts br ON br.run_id = b.run_id
    WHERE b.run_id = ?`, runId);
}

function recordIntegrity(row, proof) {
  const binding = parse(row.binding_json);
  const receipt = parse(row.receipt_json);
  if (!binding.valid || !receipt.valid) return false;
  return biologicalIntegrity.digest(binding.value) === row.binding_hash
    && biologicalIntegrity.digest(receipt.value) === row.payload_hash
    && biologicalIntegrity.digest(proof.content) === row.payload_hash
    && proof.reference === `sha256:${row.payload_hash}`;
}

function boundToScope(row, context) {
  const { proof, missionId, workerId } = context;
  const content = proof.content || {};
  return row.mission_id === missionId && row.receipt_mission_id === missionId
    && row.agent_id === workerId && row.run_agent_id === workerId
    && content.missionId === missionId && content.workerId === workerId
    && content.runId === row.run_id;
}

async function assessWorldRun(db, context) {
  const { input, missionId, world } = context;
  const proof = proofFor(input, world.agent_id);
  if (!proof?.content?.runId) return result('partial', 'trinity_world_run_proof_missing');
  const row = await runRow(db, proof.content.runId);
  if (!row) return result('partial', 'trinity_world_run_missing');
  if (!recordIntegrity(row, proof)) return result('failed', 'trinity_world_run_integrity_failed');
  if (!boundToScope(row, { proof, missionId, workerId: world.agent_id })) {
    return result('failed', 'trinity_world_run_scope_mismatch');
  }
  if (row.run_status !== 'completed' || proof.content.result?.verified !== true) {
    return result('partial', 'trinity_world_run_unverified');
  }
  return result('verified', null, { runId: row.run_id, workerId: world.agent_id });
}

async function assessRuns(db, input, state) {
  const worlds = initialWorlds(state);
  const workers = new Set(worlds.map((world) => world.agent_id));
  const members = new Set((input.evidence?.members || [])
    .map((item) => item.memberId || item.workerId).filter(Boolean));
  if (worlds.length !== workers.size || workers.size !== members.size
      || [...workers].some((worker) => !members.has(worker))) {
    return result('partial', 'trinity_world_members_mismatch');
  }
  const runs = [];
  for (const world of worlds) {
    const assessed = await assessWorldRun(db, { input, missionId: state.experiment.mission_id, world });
    if (assessed.status !== 'verified') return assessed;
    runs.push({ runId: assessed.runId, workerId: assessed.workerId,
      worldNumber: world.world_number });
  }
  return result('verified', null, { runs });
}

function qualificationResult(state) {
  const assessment = qualification.assess({ variant: state.variant,
    missionId: state.experiment.mission_id, experiment: state.experiment,
    dispatch: state.dispatch, worlds: state.worlds, transitions: state.transitions,
    comparisonProof: state.comparisonProof, initialProof: state.initialProof,
    signedObjectValid: state.signedObjectValid });
  if (assessment.qualified) return result('verified', null, { assessment });
  if (TERMINAL_FAILURES.has(state.experiment.status)) {
    return result('failed', 'trinity_terminal_failure', { assessment });
  }
  if (state.object && !state.signedObjectValid) {
    return result('failed', 'trinity_signed_candidate_invalid', { assessment });
  }
  if (state.experiment.status === 'promoted') {
    return result('failed', assessment.reasons[0] || 'trinity_promoted_state_invalid', { assessment });
  }
  const integrity = assessment.reasons.find((reason) => INTEGRITY_REASONS.has(reason));
  return integrity ? result('failed', integrity, { assessment })
    : result('partial', assessment.reasons[0] || 'trinity_qualification_incomplete', { assessment });
}

async function read(input = {}) {
  const { db, missionId } = input;
  if (!db || !missionId) return result('partial', 'trinity_scope_missing');
  try {
    const located = await locate(db, missionId, input.context);
    if (located.status !== 'located') return located;
    const state = await readCanonicalState(db, missionId, located.experiment);
    if (state.status !== 'read') return state;
    const runs = await assessRuns(db, input, state);
    if (runs.status !== 'verified') return { ...runs, experiment: state.experiment };
    const qualified = qualificationResult(state);
    if (qualified.status !== 'verified') return { ...qualified, experiment: state.experiment };
    return result('read', null, { ...state, runs: runs.runs,
      qualification: qualified.assessment });
  } catch (_) {
    return result('partial', 'trinity_canonical_state_unavailable');
  }
}

module.exports = { read, signedCandidate };
