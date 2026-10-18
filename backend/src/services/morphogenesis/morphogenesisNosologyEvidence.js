'use strict';

const catalog = require('../../../../shared/nosology.json');

const CONDITION_FAMILIES = new Map(catalog.conditions.map((item) => [item.id, item.category]));
const RUST_PATHOLOGY_FAMILIES = Object.freeze({
  CytokineStorm: 'Autoimmune', MacrophageHyperactivation: 'Autoimmune',
  AutologousTargeting: 'Autoimmune', TelomereExhaustion: 'Degenerative',
  ReplicativeSenescence: 'Degenerative', PrionAggregation: 'Degenerative',
  ContextualDecay: 'Degenerative', ViralInfection: 'Infectious',
  CrossContamination: 'Infectious', HospitalAcquiredInfection: 'Infectious'
});
const IATROGENIC_VARIANTS = new Set(['SteroidInducedComa', 'AntibioticCollateralDamage',
  'PersistentReceptorBlockade', 'IatrogenicCognitiveDrift', 'TherapyAdverseEffect']);
const NOSOCOMIAL_VARIANTS = new Set(['CrossContamination', 'HospitalAcquiredInfection']);

function safeJson(value, fallback = null) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function boundedIds(values) {
  return [...new Set((values || []).filter((value) => typeof value === 'string' && value.trim()))]
    .slice(0, 64);
}

async function safeRows(db, query) {
  try { return { rows: await db.all(query.sql, ...query.params), error: null }; }
  catch (error) { return { rows: [], error: error.code || 'query_failed' }; }
}

function scopedQuery(table, ids, fields) {
  const placeholders = ids.map(() => '?').join(',');
  return { sql: `SELECT ${fields} FROM ${table} WHERE agent_id IN (${placeholders})`, params: ids };
}

async function loadNodeStates(db, agentIds) {
  if (!agentIds.length) return { rows: [], error: null };
  const placeholders = agentIds.map(() => '?').join(',');
  return safeRows(db, { sql: `SELECT cs.agent_id AS agentId, cs.vitals_json AS vitalsJson,
    cs.immune_titer AS immuneTiter, cs.inflammatory_index AS inflammatoryIndex,
    cs.cell_cycle_state AS cellCycleState, cs.plasmid_load AS plasmidLoad,
    cs.pathogen_burden AS pathogenBurden, cs.iatrogenic_load AS iatrogenicLoad,
    cs.wellness_score AS wellnessScore, cs.updated_at AS updatedAt, a.status AS agentStatus
    FROM clinical_states cs LEFT JOIN agents a ON a.id = cs.agent_id
    WHERE cs.agent_id IN (${placeholders})`, params: agentIds });
}

async function loadNodePathologies(db, agentIds) {
  if (!agentIds.length) return { rows: [], error: null };
  const query = scopedQuery('pathologies', agentIds, `agent_id AS agentId, id,
    pathology_type AS pathologyType, severity, confidence, status, evidence_json AS evidenceJson,
    detected_at AS detectedAt`);
  query.sql += " AND status IN ('confirmed','chronic') ORDER BY detected_at DESC LIMIT 256";
  return safeRows(db, query);
}

function rustScopeQuery(scope) {
  if (!scope.missionId || !scope.organizationId || !scope.projectId) return null;
  return { sql: `SELECT l.cell_id AS agentId, a.authorization_id AS authorizationId,
    a.operation_id AS operationId, a.result_json AS resultJson
    FROM clinical_authorization_applications a
    JOIN clinical_authorization_ledger l ON l.authorization_id = a.authorization_id
    WHERE l.mission_id = ? AND l.organization_id = ? AND l.project_id = ?
      AND a.state = 'completed' ORDER BY a.completed_at_unix_ms DESC LIMIT 64`,
  params: [scope.missionId, scope.organizationId, scope.projectId] };
}

async function loadRustApplications(db, scope) {
  const query = rustScopeQuery(scope);
  return query ? safeRows(db, query) : { rows: [], error: 'rust_scope_unavailable' };
}

function normalizeState(row) {
  return { ...row, vitals: safeJson(row.vitalsJson, {}),
    immuneTiter: Number(row.immuneTiter), inflammatoryIndex: Number(row.inflammatoryIndex),
    plasmidLoad: Number(row.plasmidLoad), pathogenBurden: Number(row.pathogenBurden),
    iatrogenicLoad: Number(row.iatrogenicLoad), wellnessScore: Number(row.wellnessScore) };
}

function rustClinicalState(result) {
  const envelope = safeJson(result, {});
  const receipt = envelope.rust || envelope;
  return { receipt, clinical: receipt.cell_state_after?.clinical || null };
}

function rustVariant(pathology) {
  if (typeof pathology === 'string') return { variant: pathology, payload: {} };
  const entry = pathology && typeof pathology === 'object' ? Object.entries(pathology)[0] : null;
  return entry ? { variant: entry[0], payload: entry[1] || {} } : null;
}

function rustPathology(pathology, source) {
  const parsed = rustVariant(pathology);
  if (!parsed) return null;
  const condition = parsed.variant === 'Nosological' ? parsed.payload.condition : null;
  const family = condition ? CONDITION_FAMILIES.get(condition) : RUST_PATHOLOGY_FAMILIES[parsed.variant];
  const causalClass = IATROGENIC_VARIANTS.has(parsed.variant) ? 'iatrogenic'
    : NOSOCOMIAL_VARIANTS.has(parsed.variant) ? 'nosocomial' : 'intrinsic';
  return { source: 'rust', sourceRef: source, pathologyType: condition || parsed.variant,
    family: family || null, causalClass,
    severity: Number.isFinite(Number(parsed.payload.severity)) ? Number(parsed.payload.severity) : 1,
    confidence: 1, status: 'confirmed' };
}

function normalizeRustApplication(row) {
  const { receipt, clinical } = rustClinicalState(row.resultJson);
  const source = `clinical-application:${row.authorizationId}:${row.operationId}`;
  const diagnoses = (clinical?.active_pathologies || []).map((item) => rustPathology(item, source)).filter(Boolean);
  return { agentId: row.agentId, sourceRef: source, status: receipt.status || 'unknown',
    treatmentAdministered: receipt.treatment_administered === true,
    quarantined: clinical?.is_quarantined === true, diagnoses };
}

function statusFor(results) {
  const observed = results.some((result) => result.rows.length);
  const failed = results.some((result) => result.error && result.error !== 'rust_scope_unavailable');
  if (observed && failed) return 'partial';
  if (observed) return 'observed';
  return failed ? 'unavailable' : 'empty';
}

async function loadNosologyEvidence(input = {}) {
  const db = input.db;
  if (!db || typeof db.all !== 'function') return { status: 'unavailable', reason: 'clinical_database_unavailable',
    states: [], pathologies: [], rustApplications: [], errors: ['clinical_database_unavailable'] };
  const agentIds = boundedIds(input.agentIds);
  const [states, pathologies, applications] = await Promise.all([
    loadNodeStates(db, agentIds), loadNodePathologies(db, agentIds), loadRustApplications(db, input)
  ]);
  const results = [states, pathologies, applications];
  return { status: statusFor(results),
    states: states.rows.map(normalizeState),
    pathologies: pathologies.rows.map((row) => ({ ...row, evidence: safeJson(row.evidenceJson, []) })),
    rustApplications: applications.rows.map(normalizeRustApplication),
    errors: results.map((result) => result.error).filter(Boolean) };
}

module.exports = { loadNosologyEvidence, rustPathology, CONDITION_FAMILIES };
