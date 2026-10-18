'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const contracts = require('./versionedContractService');
const admissionContract = require('./endogenousThoughtAdmissionContractService');
const thoughtStore = require('./endogenousThoughtStoreService');
const migration = require('../db/migrations/migrateEndogenousThoughtAdmissions');
const arbitration = require('./agow/workspaceArbitrationService');
const { validCandidate } = require('./agow/candidateValidationService');

const CONDITIONS = new Set(['full', 'agow_arbitration_ablated']);
const BOUNDARIES = Object.freeze({ authorityGranted: false, promotionEligible: false,
  taskCreated: false, externalActionAllowed: false, agowModeMutated: false });

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw coded(code, 'A non-empty identifier is required.');
  return value.trim();
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function scopedId(prefix, material) {
  return `${prefix}_${digest(material).slice(0, 24)}`;
}

function normalizePolicy(policy) {
  const id = required(policy?.id, 'ENDOGENOUS_ADMISSION_POLICY_REQUIRED');
  const condition = required(policy?.condition, 'ENDOGENOUS_ADMISSION_CONDITION_REQUIRED');
  if (!CONDITIONS.has(condition)) {
    throw coded('ENDOGENOUS_ADMISSION_CONDITION_INVALID', 'Admission condition is not supported.');
  }
  const ttlMs = Math.max(1000, Math.min(3600000, Math.floor(Number(policy.ttlMs) || 60000)));
  return { enabled: true, id, condition, ttlMs };
}

function normalizeInput(input) {
  const nowMs = Number(input?.nowMs ?? Date.now());
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw coded('ENDOGENOUS_ADMISSION_TIME_INVALID', 'Admission time must be a positive epoch value.');
  }
  return { organizationId: required(input?.organizationId, 'ENDOGENOUS_ORGANIZATION_REQUIRED'),
    projectId: required(input?.projectId, 'ENDOGENOUS_PROJECT_REQUIRED'),
    episodeId: required(input?.episodeId, 'ENDOGENOUS_EPISODE_REQUIRED'),
    policy: normalizePolicy(input.policy), nowMs };
}

function parseStoredReceipt(row, type) {
  let receipt;
  try { receipt = JSON.parse(row.receipt_json); } catch (_) {
    throw coded('ENDOGENOUS_ADMISSION_INTEGRITY_FAILED', 'Stored receipt is not valid JSON.');
  }
  const validation = type === 'EndogenousThoughtAdmission'
    ? admissionContract.readReceipt(receipt) : contracts.readReceipt(receipt);
  if (row.content_hash !== digest(receipt) || !validation.valid || receipt.contractType !== type) {
    throw coded('ENDOGENOUS_ADMISSION_INTEGRITY_FAILED', 'Stored receipt integrity validation failed.');
  }
  return receipt;
}

async function loadQuestion(db, input) {
  const row = await db.get(`SELECT * FROM endogenous_thought_questions
    WHERE organization_id=? AND project_id=? AND receipt_id=?`,
  input.organizationId, input.projectId, input.questionRef);
  if (!row || row.episode_id !== input.episodeId) {
    throw coded('ENDOGENOUS_QUESTION_NOT_FOUND', 'Question receipt is not attached to this episode.');
  }
  return parseStoredReceipt(row, 'EndogenousQuestion');
}

function measures(question, control = false) {
  if (control) return { predictionError: 0, uncertainty: 0, goalRelevance: 0.8,
    expectedInformationGain: 0.05, urgency: 0, novelty: 0, actionability: 0.1,
    causalConfidence: 1, evidenceDebt: 0, estimatedCost: 0 };
  const info = question.expectedInformationGain;
  const risk = question.risk;
  return { predictionError: risk, uncertainty: risk, goalRelevance: 0.8,
    expectedInformationGain: info, urgency: risk, novelty: info,
    actionability: 1 - risk, causalConfidence: 1 - risk,
    evidenceDebt: risk, estimatedCost: question.estimatedCost.usd };
}

function candidateBase(context, kind) {
  const control = kind === 'control';
  const question = context.question.payload;
  const candidateId = scopedId(`ett_${kind}`, `${context.input.episodeId}:${context.input.questionRef}`);
  const evidenceRefs = [...new Set([context.input.questionRef, ...question.sourceRefs])];
  const stateHash = digest({ candidateId, evidenceRefs, measures: measures(question, control) });
  return { candidateId, agentId: context.episode.agentId,
    source: { module: 'epistemic', instanceId: 'endogenous-thought', modality: 'question' },
    content: { semanticType: control ? 'planned_control' : 'endogenous_question',
      artifactRef: context.input.questionRef,
      compactPreview: control ? 'Abstention planifiée.' : question.text.slice(0, 2000) },
    epistemicOrigin: { origin: 'self_generated', realityMode: 'real', agency: 'self',
      simulationId: null, parentRealityFrameId: null },
    evidenceRefs, causalParents: [context.episode.triggerRef], measures: measures(question, control),
    constraints: { safety: 'clear', integrity: 'clear', viability: 'clear', userPolicy: 'clear' },
    redundancyKey: context.input.questionRef, producedAt: context.input.nowMs,
    expiresAt: context.input.nowMs + context.input.policy.ttlMs, stateHash };
}

function buildCandidates(context) {
  const candidates = [candidateBase(context, 'investigate'), candidateBase(context, 'control')];
  if (!candidates.every(validCandidate)) {
    throw coded('ENDOGENOUS_ADMISSION_CANDIDATE_INVALID', 'Generated AGOW candidate is invalid.');
  }
  return candidates;
}

function ablatedResult(candidates) {
  const control = candidates[1];
  return { priority: null, candidates: [control], selected: [control],
    competition: { winners: [control.candidateId], activations: { [control.candidateId]: 1 }, rounds: 0 } };
}

function arbitrateCandidates(input, candidates) {
  if (input.policy.condition === 'agow_arbitration_ablated') return ablatedResult(candidates);
  return arbitration.arbitrate({ candidates, capacity: 1, regretContext: { controlRegret: false },
    competition: { rounds: 3, inhibition: 0.2, margin: 0 } });
}

function decisionPayload(context) {
  const candidates = buildCandidates(context);
  const result = arbitrateCandidates(context.input, candidates);
  const proposal = candidates[0];
  const selectedProposal = result.selected.some((item) => item.candidateId === proposal.candidateId);
  const admitted = context.input.policy.condition !== 'agow_arbitration_ablated' && selectedProposal;
  const reason = admitted ? 'agow-selected' : context.input.policy.condition === 'agow_arbitration_ablated'
    ? 'agow-arbitration-ablated' : 'agow-control-selected';
  return { decisionId: context.identity.decisionId, episodeId: context.input.episodeId,
    questionRef: context.input.questionRef, policyId: context.input.policy.id,
    condition: context.input.policy.condition, outcome: admitted ? 'admitted' : 'abstained', reason,
    selectedCandidateId: admitted ? proposal.candidateId : null,
    candidateIds: candidates.map((item) => item.candidateId),
    arbitration: { winners: result.competition.winners,
      activations: result.competition.activations, rounds: result.competition.rounds,
      controlRegret: false }, evidenceRefs: candidates[0].evidenceRefs,
    boundaries: BOUNDARIES, decidedAt: new Date(context.input.nowMs).toISOString() };
}

function decisionIdentity(input) {
  const basis = { organizationId: input.organizationId, projectId: input.projectId,
    episodeId: input.episodeId, questionRef: input.questionRef, policyId: input.policy.id };
  return { decisionId: scopedId('ett_admission', basis),
    requestHash: digest({ ...basis, condition: input.policy.condition }) };
}

function readDecision(row, requestHash) {
  if (!row) return null;
  if (row.request_hash !== requestHash) {
    throw coded('ENDOGENOUS_ADMISSION_IDEMPOTENCY_CONFLICT',
      'Question is already bound to another admission request.');
  }
  const receipt = parseStoredReceipt(row, 'EndogenousThoughtAdmission');
  const payload = receipt.payload;
  const bound = payload.decisionId === row.decision_id && payload.episodeId === row.episode_id
    && payload.questionRef === row.question_ref && payload.policyId === row.policy_id
    && payload.outcome === row.outcome && payload.reason === row.reason;
  if (!bound) {
    throw coded('ENDOGENOUS_ADMISSION_INTEGRITY_FAILED',
      'Admission row does not match its versioned receipt.');
  }
  return { receipt, replayed: true };
}

async function storedDecision(db, input, identity) {
  const row = await db.get(`SELECT * FROM endogenous_thought_admission_decisions
    WHERE organization_id=? AND project_id=? AND question_ref=?`,
  input.organizationId, input.projectId, input.questionRef);
  return readDecision(row, identity.requestHash);
}

async function persistDecision(db, context) {
  const receipt = admissionContract.createReceipt(context.payload);
  const contentHash = digest(receipt);
  return withTransaction(db, async () => {
    await db.run(`INSERT OR IGNORE INTO endogenous_thought_admission_decisions
      (organization_id,project_id,decision_id,episode_id,question_ref,policy_id,outcome,
       reason,request_hash,receipt_id,content_hash,receipt_json,decided_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, context.input.organizationId, context.input.projectId,
    context.identity.decisionId, context.input.episodeId, context.input.questionRef,
    context.input.policy.id, context.payload.outcome, context.payload.reason,
    context.identity.requestHash, receipt.receiptId, contentHash, canonicalJson(receipt),
    context.payload.decidedAt);
    return storedDecision(db, context.input, context.identity);
  });
}

function transitionPayload(context) {
  const admitted = context.decision.receipt.payload.outcome === 'admitted';
  const head = context.head.receipt.payload;
  return { transitionId: scopedId('ett_transition_admission', context.identity.decisionId),
    episodeId: context.input.episodeId, agentId: context.episode.agentId,
    projectId: context.input.projectId, mandateRef: context.episode.mandateRef,
    fromState: 'QUESTIONED', toState: admitted ? 'ADMITTED' : 'ABSTAINED',
    triggerRef: context.episode.triggerRef, questionRef: context.input.questionRef,
    decisionRef: context.decision.receipt.receiptId, taskRef: null, jobRef: null,
    budget: context.episode.budget,
    evidenceRefs: [...new Set([...head.evidenceRefs, context.decision.receipt.receiptId])],
    stopReason: admitted ? null : context.decision.receipt.payload.reason,
    occurredAt: context.decision.receipt.payload.decidedAt,
    previousReceiptId: context.episode.currentReceiptId };
}

async function advanceEpisode(db, context) {
  const target = context.decision.receipt.payload.outcome === 'admitted' ? 'ADMITTED' : 'ABSTAINED';
  if (context.episode.currentState === target) {
    return { receipt: context.head.receipt, replayed: true, sequence: context.head.sequence };
  }
  if (context.episode.currentState !== 'QUESTIONED') {
    throw coded('ENDOGENOUS_ADMISSION_STATE_CONFLICT', 'Episode is not awaiting admission.');
  }
  return thoughtStore.transitionEpisode(db, { organizationId: context.input.organizationId,
    projectId: context.input.projectId, payload: transitionPayload(context) });
}

async function admitQuestion(db, rawInput) {
  if (rawInput?.policy?.enabled !== true) return { status: 'skipped', reason: 'disabled' };
  const input = normalizeInput(rawInput);
  await thoughtStore.ensure(db);
  await migration.migrateEndogenousThoughtAdmissions(db);
  const episode = await thoughtStore.getEpisode(db, input);
  const receipts = await thoughtStore.listReceipts(db, input);
  const head = receipts.at(-1);
  input.questionRef = head.receipt.payload.questionRef;
  if (!input.questionRef) throw coded('ENDOGENOUS_QUESTION_NOT_FOUND', 'Episode has no active question.');
  const question = await loadQuestion(db, input);
  const identity = decisionIdentity(input);
  let decision = await storedDecision(db, input, identity);
  if (!decision) {
    if (episode.currentState !== 'QUESTIONED') {
      throw coded('ENDOGENOUS_ADMISSION_STATE_CONFLICT', 'Episode is not awaiting admission.');
    }
    const payload = decisionPayload({ input, episode, question, identity });
    decision = await persistDecision(db, { input, identity, payload });
    decision.replayed = false;
  }
  const advanced = await advanceEpisode(db, { input, episode, head, identity, decision });
  return { status: decision.receipt.payload.outcome, decision, episode: advanced };
}

module.exports = { BOUNDARIES, CONDITIONS, admitQuestion, normalizePolicy };
