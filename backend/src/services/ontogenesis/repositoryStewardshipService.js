'use strict';

const ledger = require('./ledgerService');
const memory = require('./memoryService');
const policy = require('./repositoryStewardshipPolicy');

const CONTRACT = 'repository_stewardship_contract';
const CANDIDATE = 'repository_candidate_proposed';
const ASSESSMENT = 'repository_candidate_assessed';

function payloadOf(row) {
  try { return JSON.parse(row.payload_json || '{}'); } catch (_) { return {}; }
}

async function events(db, projectId) {
  const rows = await db.all(`SELECT seq, kind, payload_json FROM ontogenesis_ledger
    WHERE project_id = ? AND kind IN (?, ?, ?) ORDER BY seq ASC`,
  [projectId, CONTRACT, CANDIDATE, ASSESSMENT]);
  return rows.map((row) => ({ seq: row.seq, kind: row.kind, payload: payloadOf(row) }));
}

function latestOf(entries, kind) {
  return [...entries].reverse().find((entry) => entry.kind === kind)?.payload || null;
}

async function assertProject(db, projectId) {
  const project = await db.get('SELECT id FROM ontogenesis_projects WHERE id = ?', [projectId]);
  if (!project) throw new Error('projet-stewardship-introuvable');
}

function removed(before, after) {
  return before.filter((item) => !after.includes(item));
}

function assertExplicitWeakening(current, contract, rationale) {
  if (!current) return;
  const removedItems = [...removed(current.contract.constraints, contract.constraints),
    ...removed(current.contract.invariants, contract.invariants)];
  if (removedItems.length && (!rationale || !String(rationale).trim())) {
    throw new Error('affaiblissement-contrat-non-justifie');
  }
}

async function registerContract(db, input) {
  await assertProject(db, input.projectId);
  const history = await events(db, input.projectId);
  const current = latestOf(history, CONTRACT);
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion !== (current?.version || 0)) {
    throw new Error('version-contrat-obsolete');
  }
  const contract = policy.normalizeContract(input.contract);
  assertExplicitWeakening(current, contract, input.changeRationale);
  const version = expectedVersion + 1;
  const payload = { version, contract, previousHash: current?.contractHash || null,
    changeRationale: input.changeRationale || null };
  payload.contractHash = policy.digest({ projectId: input.projectId, ...payload });
  await ledger.appendEntry(db, { projectId: input.projectId, kind: CONTRACT, payload });
  await memory.recordMemory(db, { projectId: input.projectId, kind: 'constraint',
    content: `repository-contract:v${version}:${payload.contractHash}`,
    provenance: { contractHash: payload.contractHash, previousHash: payload.previousHash } });
  return payload;
}

function replayCandidate(history, input, candidate) {
  const existing = history.filter((entry) => entry.kind === CANDIDATE)
    .find((entry) => entry.payload.candidateId === input.candidateId)?.payload;
  if (!existing) return null;
  if (policy.digest(existing) !== policy.digest(candidate)) throw new Error('candidate-idempotence-conflit');
  return { ...existing, replayed: true };
}

async function proposeCandidate(db, input) {
  const history = await events(db, input.projectId);
  const contract = latestOf(history, CONTRACT);
  if (!contract) throw new Error('contrat-stewardship-requis');
  const candidate = policy.normalizeCandidate(input, contract);
  const replay = replayCandidate(history, input, candidate);
  if (replay) return replay;
  await ledger.appendEntry(db, { projectId: input.projectId, kind: CANDIDATE, payload: candidate });
  return { ...candidate, replayed: false };
}

async function currentState(db, projectId) {
  const history = await events(db, projectId);
  return { contract: latestOf(history, CONTRACT), candidate: latestOf(history, CANDIDATE),
    assessment: latestOf(history, ASSESSMENT), history };
}

function assessmentReplay(history, assessment) {
  const existing = history.filter((entry) => entry.kind === ASSESSMENT)
    .find((entry) => entry.payload.assessmentId === assessment.assessmentId)?.payload;
  if (!existing) return null;
  if (policy.digest(existing) !== policy.digest(assessment)) throw new Error('assessment-idempotence-conflit');
  return { ...existing, replayed: true };
}

function candidateFor(history, candidateId) {
  return history.filter((entry) => entry.kind === CANDIDATE)
    .find((entry) => entry.payload.candidateId === candidateId)?.payload || null;
}

function assessmentPayload(input, candidate, contract) {
  const verdict = policy.assess(candidate, { ...input, currentContractHash: contract.contractHash });
  return { assessmentId: input.assessmentId, candidateId: candidate.candidateId,
    contractHash: candidate.contractHash, decision: verdict.decision, reasons: verdict.reasons,
    proof: input.proof || null, integration: input.integration || null, effect: input.effect || null };
}

async function recordCausalMemory(db, projectId, assessment) {
  const provenance = { assessmentId: assessment.assessmentId, candidateId: assessment.candidateId,
    contractHash: assessment.contractHash, integrationSha: assessment.integration?.sha || null,
    proofRefs: assessment.proof?.evidenceRefs || [], effectRefs: assessment.effect?.evidenceRefs || [] };
  await memory.recordMemory(db, { projectId,
    kind: assessment.decision === 'ADOPT' ? 'decision' : 'failure',
    content: JSON.stringify({ decision: assessment.decision, reasons: assessment.reasons }), provenance });
}

async function assessCandidate(db, input) {
  if (!input.assessmentId || typeof input.assessmentId !== 'string') throw new TypeError('assessment-id-requis');
  const history = await events(db, input.projectId);
  const contract = latestOf(history, CONTRACT);
  const candidate = candidateFor(history, input.candidateId);
  if (!contract || !candidate) throw new Error('candidat-stewardship-introuvable');
  const assessment = assessmentPayload(input, candidate, contract);
  const replay = assessmentReplay(history, assessment);
  if (replay) return replay;
  await ledger.appendEntry(db, { projectId: input.projectId, kind: ASSESSMENT, payload: assessment });
  await recordCausalMemory(db, input.projectId, assessment);
  return { ...assessment, replayed: false };
}

function resumeDecision(state) {
  if (!state.contract) return { decision: 'NO_CHANGE', nextAction: 'define_contract', reason: 'contrat-absent' };
  if (!state.candidate) return { decision: 'NO_CHANGE', nextAction: 'formulate_hypothesis', reason: 'candidat-absent' };
  if (state.candidate.contractHash !== state.contract.contractHash) {
    return { decision: 'NO_CHANGE', nextAction: 'reconcile_contract', reason: 'contrat-candidat-obsolete' };
  }
  const assessment = [...state.history].reverse().find((entry) => entry.kind === ASSESSMENT
    && entry.payload.candidateId === state.candidate.candidateId)?.payload;
  if (!assessment) return { decision: 'NO_CHANGE', nextAction: 'assess_candidate', reason: 'evaluation-absente' };
  return { decision: assessment.decision,
    nextAction: assessment.decision === 'ADOPT' ? 'observe_repository' : 'formulate_alternative',
    reason: assessment.reasons[0] || 'effet-projet-demontre', assessmentId: assessment.assessmentId };
}

async function resumeStewardship(db, projectId) {
  const state = await currentState(db, projectId);
  return { projectId, contractVersion: state.contract?.version || null,
    contractHash: state.contract?.contractHash || null, candidateId: state.candidate?.candidateId || null,
    ...resumeDecision(state) };
}

module.exports = { CONTRACT, CANDIDATE, ASSESSMENT, registerContract, proposeCandidate,
  assessCandidate, resumeStewardship, currentState };
