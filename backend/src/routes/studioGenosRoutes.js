'use strict';
const router = require('express').Router();
const { getDatabase } = require('../db');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const worlds = require('../services/studioWorldsService');

router.use(requireTenantScope());
router.use((req, res, next) => req.tenant ? next() : res.status(403).json({ error: { code: 'TENANT_SCOPE_REQUIRED' } }));

function handle(operation) {
  return async (req, res, next) => {
    try {
      const db = await getDatabase();
      const result = await operation(db, { scope: req.tenant, agentId: req.params.id,
        body: req.body || {}, query: req.query, memoryId: req.params.memoryId, genomeId: req.params.genomeId,
        actor: req.user.keyId || req.user.username });
      res.json(result);
    } catch (error) { next(error); }
  };
}

function delegate(operation) {
  return async (req, res, next) => {
    try {
      const db = await getDatabase();
      await worlds.agent(db, { scope: req.tenant, agentId: req.params.id });
      await operation({ ...req, body: { ...req.body, agentId: req.params.id, nodeId: req.params.id } }, res);
    } catch (error) { next(error); }
  };
}

const lineage = require('../controllers/lineage');
const write = [requirePermission('workspace:write'), requireTenantScope({ write: true })];
router.get('/agents/:id/worlds', requirePermission('read'), handle(worlds.inspect));
router.post('/agents/:id/checkpoints', ...write, delegate(lineage.snapshotAgentState));
router.post('/agents/:id/branches', ...write, delegate(lineage.branchAgentState));
router.post('/agents/:id/clone', ...write, delegate(lineage.cloneNode));
router.post('/agents/:id/compare', requirePermission('read'), delegate(async (req, res) => {
  await lineage.diffAgents({ ...req, body: { leftAgentId: req.params.id, rightAgentId: req.body.rightAgentId } }, res);
}));

const memory = require('../services/studioMemoryService');
router.get('/memories', requirePermission('read'), handle(memory.list));
router.get('/memories/:memoryId', requirePermission('read'), handle(memory.inspect));
router.post('/memories', ...write, handle(memory.record));
router.post('/memories/:memoryId/transfer', ...write, handle(memory.transfer));

const genome = require('../services/studioGenomeService');
router.get('/genomes', requirePermission('read'), handle(genome.list));
router.get('/genomes/:genomeId', requirePermission('read'), handle(genome.inspect));
router.post('/genomes/:genomeId/mutate', ...write, handle(genome.mutate));

const recovery = require('../services/studioRecoveryService');
router.get('/agents/:id/diagnostic', requirePermission('read'), handle(recovery.inspect));
router.post('/agents/:id/stop', ...write, requirePermission('emergency_kill'), handle(recovery.stop));

const collective = require('../services/studioCollectiveService');
router.get('/agents/:id/collective', requirePermission('read'), handle(collective.inspect));
router.post('/agents/:id/collective/step', ...write, handle(collective.step));

const perception = require('../services/studioPerceptionService');
router.get('/agents/:id/perception', requirePermission('read'), handle(perception.inspect));
router.post('/agents/:id/perception/plan', ...write, handle(perception.plan));
router.post('/agents/:id/perception/probe', ...write, handle(perception.probe));

const biomimetic = require('../services/studioBiomimeticService');
router.post('/agents/:id/biomimetic/creative', ...write, handle(biomimetic.creative));
router.post('/agents/:id/biomimetic/physics', ...write, handle(biomimetic.physics));

module.exports = { router, handle, write };
