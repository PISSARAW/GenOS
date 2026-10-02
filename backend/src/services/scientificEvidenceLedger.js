'use strict';

const crypto = require('node:crypto');

const LEVELS = new Set(['L1', 'L2', 'L3', 'L4', 'L5']);
const TOPOLOGIES = new Set(['holobionte', 'syncytium', 'a-team', 'biocenose', 'trinity', 'biome', 'rhizome', 'metapopulation']);
const RELATIONS = new Set(['SUPPORTS', 'CONTRADICTS', 'QUALIFIES']);
const REPLICATIONS = new Set(['repeatability', 'reproducibility', 'robustness', 'independent_replication', 'generalization']);
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

function invalid(message, code = 'SCIENTIFIC_EVIDENCE_INVALID') {
  return Object.assign(new Error(message), { code });
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${field} is required.`);
  return value.trim();
}

function json(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${field} must be an object.`);
  return JSON.stringify(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function normalizeEvidence(value) {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) throw new Error('empty serialization');
    return JSON.parse(serialized);
  } catch (_) {
    throw invalid('evidence must be JSON serializable.');
  }
}

function digest(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

function identifier(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function topologyRefs(value = []) {
  if (!Array.isArray(value) || value.some((item) => !TOPOLOGIES.has(item))) {
    throw invalid('topologyRefs must contain only the eight registered GenOS topologies.');
  }
  return [...new Set(value)].sort();
}

async function createExperiment(db, input) {
  const level = requireText(input.proofLevel, 'proofLevel');
  if (level === 'L0') throw invalid('L0 is ephemeral and cannot be persisted.', 'SCIENTIFIC_EPHEMERAL_NOT_PERSISTED');
  if (!LEVELS.has(level)) throw invalid('proofLevel must be L1 through L5.');
  const record = {
    experimentId: input.experimentId || identifier('exp'),
    title: requireText(input.title, 'title'), proofLevel: level,
    protocol: input.protocol || {}, environment: input.environment || {},
    topologyRefs: topologyRefs(input.topologyRefs), createdBy: requireText(input.createdBy, 'createdBy')
  };
  await db.run(`INSERT INTO scientific_experiments
    (experiment_id, title, proof_level, protocol_json, environment_json, topology_refs_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, record.experimentId, record.title, record.proofLevel,
  json(record.protocol, 'protocol'), json(record.environment, 'environment'), JSON.stringify(record.topologyRefs), record.createdBy);
  return record;
}

async function recordClaim(db, input) {
  const experiment = await db.get('SELECT experiment_id FROM scientific_experiments WHERE experiment_id = ?', input.experimentId);
  if (!experiment) throw invalid('Scientific experiment does not exist.', 'SCIENTIFIC_EXPERIMENT_UNKNOWN');
  const claim = {
    claimId: input.claimId || identifier('claim'), experimentId: input.experimentId,
    statement: requireText(input.statement, 'statement'), scope: input.scope || {},
    assumptions: input.assumptions || [], createdBy: requireText(input.createdBy, 'createdBy')
  };
  if (!Array.isArray(claim.assumptions)) throw invalid('assumptions must be an array.');
  await db.run(`INSERT INTO scientific_claims
    (claim_id, experiment_id, statement, scope_json, assumptions_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?)`, claim.claimId, claim.experimentId, claim.statement,
  json(claim.scope, 'scope'), JSON.stringify(claim.assumptions), claim.createdBy);
  return claim;
}

function evidenceRecord(input) {
  const payload = normalizeEvidence(input.evidence);
  validateEvidencePayload(payload);
  const relation = validatedRelation(input.relation);
  const replication = validatedReplication(input.replicationKind);
  return {
    evidenceId: input.evidenceId || identifier('evidence'), experimentId: input.experimentId,
    claimId: input.claimId, relation, sourceKind: requireText(input.sourceKind, 'sourceKind'),
    sourceId: requireText(input.sourceId, 'sourceId'), contentHash: digest(payload),
    environmentHash: input.environmentHash || null, replicationKind: replication,
    demeId: input.demeId || null, topology: input.topology || null, evidence: payload,
    createdBy: requireText(input.createdBy, 'createdBy')
  };
}

function validateEvidencePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalid('evidence must be an object.');
}

function validatedRelation(value) {
  const relation = requireText(value, 'relation');
  if (!RELATIONS.has(relation)) throw invalid('relation must be SUPPORTS, CONTRADICTS or QUALIFIES.');
  return relation;
}

function validatedReplication(value) {
  const replication = value || null;
  if (replication && !REPLICATIONS.has(replication)) throw invalid('replicationKind is unknown.');
  return replication;
}

async function recordEvidence(db, input) {
  const claim = await db.get(`SELECT c.experiment_id, e.topology_refs_json FROM scientific_claims c
    JOIN scientific_experiments e ON e.experiment_id = c.experiment_id WHERE c.claim_id = ?`, input.claimId);
  if (!claim || claim.experiment_id !== input.experimentId) throw invalid('Evidence must reference a claim in the same experiment.', 'SCIENTIFIC_CLAIM_SCOPE_MISMATCH');
  const item = evidenceRecord(input);
  validateEvidenceContext(item, claim);
  await db.run(`INSERT INTO scientific_evidence
    (evidence_id, experiment_id, claim_id, relation, source_kind, source_id, content_hash,
     environment_hash, replication_kind, deme_id, topology, evidence_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, item.evidenceId, item.experimentId,
  item.claimId, item.relation, item.sourceKind, item.sourceId, item.contentHash,
  item.environmentHash, item.replicationKind, item.demeId, item.topology,
  JSON.stringify(item.evidence), item.createdBy);
  return item;
}

function validateEvidenceContext(item, claim) {
  if (item.topology && !TOPOLOGIES.has(item.topology)) throw invalid('topology is not a registered GenOS topology.');
  const declared = JSON.parse(claim.topology_refs_json);
  if (item.topology && !declared.includes(item.topology)) throw invalid('Evidence topology was not declared by the experiment.');
  if (item.environmentHash && !HASH_PATTERN.test(item.environmentHash)) throw invalid('environmentHash must be a SHA-256 digest.');
}

async function recordAssessment(db, input) {
  const claim = await db.get('SELECT claim_id FROM scientific_claims WHERE claim_id = ?', input.claimId);
  if (!claim) throw invalid('Scientific claim does not exist.', 'SCIENTIFIC_CLAIM_UNKNOWN');
  const item = await validatedAssessment(db, input);
  await db.run(`INSERT INTO scientific_assessments
    (assessment_id, claim_id, assessment_kind, position, verifier_status, rationale, evidence_refs_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, item.assessmentId, item.claimId, item.kind, item.position,
  item.verifierStatus, item.rationale, JSON.stringify(item.evidenceRefs), item.createdBy);
  return item;
}

async function validatedAssessment(db, input) {
  const kind = validatedAssessmentKind(input.kind);
  const status = validatedVerifierStatus(kind, input.verifierStatus);
  const refs = input.evidenceRefs || [];
  await validateAssessmentRefs(db, input.claimId, refs);
  return {
    assessmentId: input.assessmentId || identifier('assessment'), claimId: input.claimId,
    kind, position: validatedPosition(input.position), verifierStatus: status,
    rationale: requireText(input.rationale, 'rationale'), evidenceRefs: [...new Set(refs)],
    createdBy: requireText(input.createdBy, 'createdBy')
  };
}

function validatedAssessmentKind(value) {
  const kind = requireText(value, 'kind');
  if (!['consensus', 'verifier'].includes(kind)) throw invalid('kind must be consensus or verifier.');
  return kind;
}

function validatedPosition(value) {
  const position = requireText(value, 'position');
  if (!['support', 'reject', 'abstain'].includes(position)) throw invalid('position must be support, reject or abstain.');
  return position;
}

function validatedVerifierStatus(kind, value) {
  const status = value || null;
  if (kind === 'consensus' && status) throw invalid('Consensus cannot set deterministic verifier status.', 'SCIENTIFIC_CONSENSUS_CANNOT_VERIFY');
  if (kind === 'verifier' && !['verified', 'failed', 'inconclusive'].includes(status)) throw invalid('Verifier assessment requires a valid verifierStatus.');
  return status;
}

async function validateAssessmentRefs(db, claimId, refs) {
  if (!Array.isArray(refs)) throw invalid('evidenceRefs must be an array.');
  for (const ref of refs) {
    const match = await db.get('SELECT evidence_id FROM scientific_evidence WHERE claim_id = ? AND evidence_id = ?', claimId, ref);
    if (!match) throw invalid(`Evidence '${ref}' is not attached to this claim.`, 'SCIENTIFIC_EVIDENCE_REFERENCE_UNKNOWN');
  }
}

function classifyClaim(evidence, assessments) {
  const relations = new Set(evidence.map((item) => item.relation));
  const verifierVerified = assessments.some((item) => item.assessment_kind === 'verifier' && item.verifier_status === 'verified');
  const verifierFailed = assessments.some((item) => item.assessment_kind === 'verifier' && item.verifier_status === 'failed');
  const position = relations.has('SUPPORTS') && relations.has('CONTRADICTS')
    ? 'SUPPORTED_WITH_DISSENT' : relations.has('SUPPORTS') ? 'SUPPORTED' : relations.has('CONTRADICTS') ? 'CONTESTED' : 'UNRESOLVED';
  return { position, verifierStatus: verifierFailed ? 'failed' : verifierVerified ? 'verified' : 'unverified', promotionEligible: false };
}

async function inspectExperiment(db, experimentId) {
  const experiment = await db.get('SELECT * FROM scientific_experiments WHERE experiment_id = ?', experimentId);
  if (!experiment) throw invalid('Scientific experiment does not exist.', 'SCIENTIFIC_EXPERIMENT_UNKNOWN');
  const claims = await db.all('SELECT * FROM scientific_claims WHERE experiment_id = ? ORDER BY created_at, claim_id', experimentId);
  const expanded = [];
  for (const claim of claims) expanded.push(await inspectClaim(db, claim));
  return {
    experimentId: experiment.experiment_id, title: experiment.title, proofLevel: experiment.proof_level,
    protocol: JSON.parse(experiment.protocol_json), environment: JSON.parse(experiment.environment_json),
    topologyRefs: JSON.parse(experiment.topology_refs_json), createdBy: experiment.created_by, claims: expanded
  };
}

async function inspectClaim(db, claim) {
  const evidence = await db.all('SELECT * FROM scientific_evidence WHERE claim_id = ? ORDER BY created_at, evidence_id', claim.claim_id);
  const assessments = await db.all('SELECT * FROM scientific_assessments WHERE claim_id = ? ORDER BY created_at, assessment_id', claim.claim_id);
  return {
    claimId: claim.claim_id, statement: claim.statement, scope: JSON.parse(claim.scope_json),
    assumptions: JSON.parse(claim.assumptions_json), evidence: evidence.map(parseEvidence),
    assessments: assessments.map(parseAssessment), status: classifyClaim(evidence, assessments)
  };
}

function parseEvidence(row) {
  return {
    evidenceId: row.evidence_id, relation: row.relation, source: { kind: row.source_kind, id: row.source_id },
    contentHash: row.content_hash, environmentHash: row.environment_hash,
    replicationKind: row.replication_kind, demeId: row.deme_id, topology: row.topology,
    evidence: JSON.parse(row.evidence_json), createdBy: row.created_by
  };
}

function parseAssessment(row) {
  return {
    assessmentId: row.assessment_id, kind: row.assessment_kind, position: row.position,
    verifierStatus: row.verifier_status, rationale: row.rationale,
    evidenceRefs: JSON.parse(row.evidence_refs_json), createdBy: row.created_by
  };
}

function createScientificEvidenceLedger(db) {
  return {
    createExperiment: (input) => createExperiment(db, input),
    recordClaim: (input) => recordClaim(db, input),
    recordEvidence: (input) => recordEvidence(db, input),
    recordAssessment: (input) => recordAssessment(db, input),
    inspectExperiment: (input) => inspectExperiment(db, input.experimentId)
  };
}

module.exports = { createScientificEvidenceLedger };
