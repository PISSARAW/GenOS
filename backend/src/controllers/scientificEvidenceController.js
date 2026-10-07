'use strict';

const { getDatabase } = require('../db');
const { createScientificEvidenceLedger } = require('../services/scientificEvidenceLedger');

function actor(req) {
  const identity = req.user?.username || req.user?.id;
  if (!identity) throw Object.assign(new Error('Authenticated actor identity is required.'), { code: 'SCIENTIFIC_ACTOR_REQUIRED' });
  return String(identity);
}

function ledger(req) {
  return createScientificEvidenceLedger(req.scientificEvidenceDb);
}

async function createLedger(req, res, next) {
  try {
    const result = await ledger(req).createExperiment({
      experimentId: req.scientificExperiment.id, title: req.scientificExperiment.title,
      proofLevel: req.body?.proofLevel, protocol: req.body?.protocol || {},
      environment: req.body?.environment || {}, topologyRefs: req.body?.topologyRefs || [],
      createdBy: actor(req)
    });
    res.status(201).json({ success: true, experiment: result });
  } catch (error) { next(error); }
}

async function inspectLedger(req, res, next) {
  try {
    const result = await ledger(req).inspectExperiment({ experimentId: req.scientificExperiment.id });
    res.json(result);
  } catch (error) { next(error); }
}

async function recordClaim(req, res, next) {
  try {
    const result = await ledger(req).recordClaim({
      experimentId: req.scientificExperiment.id, statement: req.body?.statement,
      scope: req.body?.scope || {}, assumptions: req.body?.assumptions || [], createdBy: actor(req)
    });
    res.status(201).json({ success: true, claim: result });
  } catch (error) { next(error); }
}

async function recordEvidence(req, res, next) {
  try {
    const result = await ledger(req).recordEvidence({
      experimentId: req.scientificExperiment.id, claimId: req.params.claimId,
      relation: req.body?.relation, sourceKind: req.body?.sourceKind, sourceId: req.body?.sourceId,
      evidence: req.body?.evidence, environmentHash: req.body?.environmentHash,
      replicationKind: req.body?.replicationKind, demeId: req.body?.demeId,
      topology: req.body?.topology, createdBy: actor(req)
    });
    res.status(201).json({ success: true, evidence: result });
  } catch (error) { next(error); }
}

async function recordAssessment(req, res, next) {
  try {
    const result = await ledger(req).recordAssessment({
      experimentId: req.scientificExperiment.id,
      claimId: req.params.claimId, kind: req.body?.kind, position: req.body?.position,
      verifierStatus: req.body?.verifierStatus, rationale: req.body?.rationale,
      evidenceRefs: req.body?.evidenceRefs || [], createdBy: actor(req)
    });
    res.status(201).json({ success: true, assessment: result });
  } catch (error) { next(error); }
}

async function recordClaimTransition(req, res, next) {
  try {
    const result = await ledger(req).recordClaimTransition({
      experimentId: req.scientificExperiment.id, claimId: req.params.claimId,
      eventId: req.body?.eventId, expectedHeadHash: req.body?.expectedHeadHash,
      status: req.body?.status, rationale: req.body?.rationale,
      evidenceRefs: req.body?.evidenceRefs || [], createdBy: actor(req)
    });
    res.status(201).json({ success: true, event: result });
  } catch (error) { next(error); }
}

async function attachExperimentScope(req, res, next) {
  try {
    const db = await getDatabase();
    const tenant = req.tenant;
    const scope = tenant
      ? { sql: 'w.organization_id = ? AND w.project_id = ?', values: [tenant.organizationId, tenant.projectId] }
      : { sql: 'w.organization_id IS NULL AND w.project_id IS NULL', values: [] };
    const experiment = await db.get(`SELECT e.id, e.title, e.experiment_type
      FROM experiments e JOIN workspaces w ON w.id = e.workspace_id
      WHERE e.id = ? AND ${scope.sql}`, req.params.experimentId, ...scope.values);
    if (!experiment || experiment.experiment_type !== 'scientific_experiment') {
      return res.status(404).json({ error: { code: 'SCIENTIFIC_EXPERIMENT_NOT_FOUND', message: 'Scientific experiment not found.' } });
    }
    req.scientificEvidenceDb = db;
    req.scientificExperiment = experiment;
    next();
  } catch (error) { next(error); }
}

module.exports = { attachExperimentScope, createLedger, inspectLedger, recordClaim, recordEvidence, recordAssessment, recordClaimTransition };
