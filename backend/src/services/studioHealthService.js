'use strict';
const crypto = require('node:crypto');
const { agent, failure } = require('./studioWorldsService');
const input = require('./studioSpecialistInput');
const clinical = require('./medical/clinicalStateService');
const surveillance = require('./medical/immuneSurveillanceService');
const { withTransaction } = require('../db');

async function inspect(db, context) {
  const current = await agent(db, context);
  const latest = await require('./consumerInspectionService').inspect(db, { agentId: current.id, scope: context.scope });
  const catalog = require('./medical/nosologyCatalogService').catalog;
  const state = await clinical.getClinicalState(db, current.id);
  return { agentId: current.id, clinicalState: state, clinicalStateObserved: Boolean(state),
    immuneEvents: await clinical.getRecentImmuneEvents(db, current.id, 50),
    pathologies: await db.all('SELECT id, pathology_type AS pathologyType, status, severity, confidence, detected_at AS created_at FROM pathologies WHERE agent_id = ? ORDER BY detected_at DESC, id DESC LIMIT 50', current.id),
    conditions: catalog.conditions, therapies: catalog.therapies,
    categories: [...new Set(catalog.conditions.map(item => item.category))],
    aeisEvidence: (latest?.provenance || []).map(item => ({ assemblyId: item.assemblyId, hash: item.hash,
      historicalAccepted: item.assemblyAccepted, currentAssuranceStatus: item.currentAssurance.status })),
    clinicalSource: state ? 'persisted_agent_model' : 'unobserved',
    automaticTherapy: false, causalEstablished: false, limit: 50 };
}

async function requireClinical(db, context) {
  await agent(db, context);
  if (!await clinical.getClinicalState(db, context.agentId)) throw failure('CLINICAL_STATE_UNOBSERVED', 409);
}

async function scan(db, context) {
  await requireClinical(db, context);
  return withTransaction(db, async () => {
    const result = await surveillance.surveillanceScan(db, context.agentId);
    return input.record(db, context, { mechanism: 'nosology_surveillance', input: { source: 'persisted_clinical_state' },
      result: { detections: result.detections, quarantineRecommended: result.quarantine,
        quarantineApplied: false, automaticTherapy: false, causalEstablished: false } });
  });
}

async function biopsy(db, context) {
  await requireClinical(db, context);
  const pathologyType = input.text(context.body.pathologyType, 100);
  if (!Object.hasOwn(surveillance.PATHOLOGY_DEFINITIONS, pathologyType)) throw failure('UNKNOWN_PATHOLOGY', 400);
  return withTransaction(db, async () => {
    const result = await surveillance.biopsy(db, context.agentId, pathologyType);
    return input.record(db, context, { mechanism: 'nosology_biopsy', input: { pathologyType },
      result: { biopsyRef: result.biopsyRef, evidence: result.evidence, pathologyType, automaticTherapy: false } });
  });
}

async function diagnose(db, context) {
  await requireClinical(db, context);
  const biopsyRef = input.text(context.body.biopsyRef, 200);
  return withTransaction(db, async () => {
    const result = await surveillance.diagnose(db, context.agentId, biopsyRef);
    if (!result.ok) throw failure('BIOPSY_NOT_FOUND', 404);
    return input.record(db, context, { mechanism: 'nosology_diagnosis', input: { biopsyRef },
      result: { ...result, diagnosisScope: 'agent_model_thresholds', causalEstablished: false, automaticTherapy: false } });
  });
}

async function threats(db, context) {
  await agent(db, context);
  const text = input.text(context.body.text, 10000);
  const textHash = crypto.createHash('sha256').update(text).digest('hex');
  return input.record(db, context, { mechanism: 'innate_threat_signature_scan', input: { textHash, bytes: Buffer.byteLength(text) },
    result: { ...require('./immuneThreats').scanThreats(text), threatScope: 'signature_heuristic',
      absenceProvesSafety: false, quarantineApplied: false, automaticTherapy: false } });
}

module.exports = { inspect, scan, biopsy, diagnose, threats };
