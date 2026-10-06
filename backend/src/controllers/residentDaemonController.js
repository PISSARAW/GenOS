'use strict';

/**
 * Resident Daemon Controller — ADR 0034.
 * HTTP endpoints for territory, findings, handoffs, repair episodes.
 */

const territoryService = require('../services/daemon/daemonTerritoryService');
const runtimeService = require('../services/daemon/residentDaemonRuntime');
const handoffCompiler = require('../services/daemon/handoff/handoffCompilerService');
const handoffFeedback = require('../services/daemon/handoff/handoffFeedbackService');
const phenotypeService = require('../services/daemon/specialization/phenotypeService');
const reconciler = require('../services/daemon/reconciliation/reconcilerService');
const repairService = require('../services/daemon/repair/repairEpisodeService');
const findings = require('../services/daemon/findings/findingService');
const { getDatabase } = require('../db');

async function requireDb(req, res, next) {
  try {
    req.db = req.db || await getDatabase();
    if (!req.db) return res.status(503).json({ error: 'db-unavailable' });
    next();
  } catch (error) { next(error); }
}

async function createTerritory(req, res, next) {
  try {
    const result = await territoryService.createTerritory(req.db, req.body);
    if (!result.found) return res.status(400).json({ error: 'create-failed', details: result.errors });
    res.status(201).json({ created: true, territory: result.territory });
  } catch (err) { next(err); }
}

async function getTerritory(req, res, next) {
  try {
    const result = await territoryService.getTerritory(req.db, { id: req.params.id });
    if (!result.found) return res.status(404).json({ error: 'not-found' });
    res.json({ found: true, territory: result.territory });
  } catch (err) { next(err); }
}

async function updateHead(req, res, next) {
  try {
    const { headSha } = req.body || {};
    if (!headSha) return res.status(400).json({ error: 'headSha-required' });
    const result = await territoryService.updateHead(req.db, { id: req.params.id, headSha });
    if (!result.updated) return res.status(400).json({ error: 'update-failed', details: result.errors });
    res.json(result);
  } catch (err) { next(err); }
}

async function sweep(req, res, next) {
  try {
    const receipt = await reconciler.sweep(req.db, { ...req.body, territoryId: req.params.id });
    res.json(receipt);
  } catch (err) { next(err); }
}

async function assignPhenotypes(req, res, next) {
  try {
    const result = await phenotypeService.assignPhenotypes(req.db, { ...req.body, territoryId: req.params.id });
    if (!result.assigned) return res.status(400).json({ error: 'assign-failed' });
    res.json(result);
  } catch (err) { next(err); }
}

async function getPhenotypes(req, res, next) {
  try {
    const phenotypes = await phenotypeService.getPhenotypes(req.db, { territoryId: req.params.id });
    res.json({ territoryId: req.params.id, phenotypes });
  } catch (err) { next(err); }
}

async function compileBrief(req, res, next) {
  try {
    const result = await handoffCompiler.compileBrief(req.db, { territoryId: req.params.id, mission: req.body?.mission });
    if (!result.compiled) return res.status(400).json({ error: 'compile-failed', reason: result.reason });
    res.json({ compiled: true, brief: result.brief, signal: result.signal });
  } catch (err) { next(err); }
}

async function getBrief(req, res, next) {
  try {
    const result = await handoffCompiler.getBrief(req.db, { briefId: req.params.briefId });
    if (!result.found || result.brief.territoryId !== req.params.id) return res.status(404).json({ error: 'not-found' });
    res.json(result);
  } catch (err) { next(err); }
}

function feedbackScopeMatches(brief, finding, territoryId) {
  if (!brief.found || !finding.found) return false;
  return brief.brief.territoryId === territoryId && finding.finding.territoryId === territoryId;
}

async function recordFeedback(req, res, next) {
  try {
    const { findingId, verdict } = req.body || {};
    if (!findingId || !verdict) return res.status(400).json({ error: 'findingId-and-verdict-required' });
    const briefId = req.params.briefId || req.body?.briefId;
    const brief = await handoffCompiler.getBrief(req.db, { briefId });
    const finding = await findings.getFinding(req.db, { id: findingId });
    if (!feedbackScopeMatches(brief, finding, req.params.id)) return res.status(404).json({ error: 'not-found' });
    const result = await handoffFeedback.recordFeedback(req.db, { briefId: req.params.briefId || req.body?.briefId, findingId, verdict });
    if (!result.recorded) return res.status(400).json({ error: 'record-failed', reason: result.reason });
    res.json(result);
  } catch (err) { next(err); }
}

async function openRepairEpisode(req, res, next) {
  try {
    const { findingId, createdBy, budget, ttlMs } = req.body || {};
    if (!findingId || !createdBy) return res.status(400).json({ error: 'findingId-and-createdBy-required' });
    const finding = await findings.getFinding(req.db, { id: findingId });
    if (!finding.found || finding.finding.territoryId !== req.params.id) return res.status(404).json({ error: 'not-found' });
    const result = await repairService.openEpisode(req.db, { findingId, createdBy, budget, ttlMs });
    if (!result.opened) return res.status(400).json({ error: 'open-failed', details: result.errors });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function claimRepairEpisode(req, res, next) {
  try {
    const { workerId, workspacePath, scope } = req.body || {};
    if (!workerId) return res.status(400).json({ error: 'workerId-required' });
    const result = await repairService.claimEpisode(req.db, { id: req.params.id, workerId, workspacePath, scope });
    if (!result.claimed) return res.status(400).json({ error: 'claim-failed', details: result.errors });
    res.json(result);
  } catch (err) { next(err); }
}

async function closeRepairEpisode(req, res, next) {
  try {
    const { toStatus, workerId, verification } = req.body || {};
    if (!toStatus) return res.status(400).json({ error: 'toStatus-required' });
    const result = await repairService.closeEpisode(req.db, { id: req.params.id, toStatus, workerId, verification });
    if (!result.closed) return res.status(400).json({ error: 'close-failed', details: result.errors });
    res.json(result);
  } catch (err) { next(err); }
}

async function listDaemons(req, res, next) {
  try {
    const runtime = runtimeService.createRuntime(req.db);
    const states = await runtimeService.listDaemonStates(runtime);
    res.json({ daemons: states });
  } catch (err) { next(err); }
}

async function getDaemonState(req, res, next) {
  try {
    const runtime = runtimeService.createRuntime(req.db);
    const result = await runtimeService.getDaemonState(runtime, { daemonId: req.params.id });
    if (!result.found) return res.status(404).json({ error: 'not-found' });
    res.json(result);
  } catch (err) { next(err); }
}

function getTypes(req, res) {
  res.json(require('../services/daemon/daemonTypeCatalog').describeTypes());
}

async function verifyRepairEpisode(req, res, next) {
  try {
    const result = await require('../services/daemon/repair/repairVerificationService').verifyRepair(req.db, {
      ...req.body, id: req.params.id
    });
    res.status(result.verified ? 200 : 400).json(result);
  } catch (error) { next(error); }
}

module.exports = {
  requireDb,
  getTypes, verifyRepairEpisode,
  createTerritory,
  getTerritory,
  updateHead,
  sweep,
  assignPhenotypes,
  getPhenotypes,
  compileBrief,
  getBrief,
  recordFeedback,
  openRepairEpisode,
  claimRepairEpisode,
  closeRepairEpisode,
  listDaemons,
  getDaemonState
};