/**
 * GenOS Lineage DAG & Genome Routes
 */

const express = require('express');
const router = express.Router();
const lineageController = require('../controllers/lineageController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const agentGitController = require('../controllers/agentGitController');

router.use(requireTenantScope());

router.get('/lineage', lineageController.getLineage);
router.post('/nodes/inspect', lineageController.inspectNode);
router.post('/agents/diff', lineageController.diffAgents);
router.post('/agents/merge', requirePermission('workspace:write'), lineageController.mergeAgents);
router.post('/agents/snapshot', requirePermission('workspace:write'), lineageController.snapshotAgentState);
router.post('/agents/commit', requirePermission('workspace:write'), lineageController.commitAgentState);
router.post('/agents/branch', requirePermission('workspace:write'), lineageController.branchAgentState);
router.post('/agents/checkout', requirePermission('workspace:write'), lineageController.checkoutAgentState);
router.post('/agents/reset', requirePermission('workspace:write'), lineageController.checkoutAgentState);
router.post('/agents/cherry-pick', requirePermission('workspace:write'), lineageController.cherryPickAgentState);
router.post('/agents/git/commit', requirePermission('workspace:write'), agentGitController.commit);
router.post('/agents/git/push', requirePermission('workspace:write'), agentGitController.push);
router.post('/agents/git/fetch', requirePermission('read'), agentGitController.fetch);
router.post('/agents/git/pull', requirePermission('workspace:write'), agentGitController.pull);
router.post('/agents/git/stash', requirePermission('workspace:write'), agentGitController.stash);
router.post('/agents/git/tag', requirePermission('workspace:write'), agentGitController.tag);
router.post('/agents/git/cherry-pick', requirePermission('workspace:write'), agentGitController.cherryPick);
router.post('/agents/git/diff', requirePermission('read'), agentGitController.diff);
router.post('/agents/git/merge', requirePermission('workspace:write'), agentGitController.merge);
router.post('/agents/git/replay', requirePermission('read'), agentGitController.replay);
router.post('/agents/git/bisect', requirePermission('read'), agentGitController.bisect);
router.post('/agents/git/log', requirePermission('read'), agentGitController.log);
router.post('/agents/git/revert', requirePermission('workspace:write'), agentGitController.revert);
router.post('/agents/git/rebase', requirePermission('workspace:write'), agentGitController.rebase);
router.post('/agents/git/remote/push', requirePermission('workspace:write'), agentGitController.remoteReceive);
router.post('/agents/git/remote/fetch', requirePermission('read'), agentGitController.fetch);
router.post('/agents/git/reflog', requirePermission('read'), agentGitController.reflog);
router.post('/agents/git/show', requirePermission('read'), agentGitController.show);
router.post('/agents/git/fsck', requirePermission('read'), agentGitController.fsck);
router.post('/agents/git/gc', requirePermission('workspace:write'), agentGitController.gc);
router.post('/agents/git/blame', requirePermission('read'), agentGitController.blame);
router.post('/agents/git/describe', requirePermission('read'), agentGitController.describe);
router.post('/agents/git/note', requirePermission('workspace:write'), agentGitController.note);
router.post('/agents/git/hook', requirePermission('workspace:write'), agentGitController.hook);
router.post('/agents/git/merge-base', requirePermission('read'), agentGitController.mergeBase);
router.post('/agents/git/archive', requirePermission('read'), agentGitController.archive);
router.post('/agents/restore', requirePermission('workspace:write'), lineageController.restoreAgentState);
router.post('/agents/replay', requirePermission('read'), lineageController.replayAgentState);
router.post('/agents/bisect', requirePermission('read'), lineageController.bisectAgentState);
router.post('/nodes/clone', requirePermission('workspace:write'), lineageController.cloneNode);
router.post('/nodes/kill', requirePermission('workspace:write'), lineageController.killNode);

router.get('/genome/graph', lineageController.getGenomeGraph);
router.get('/genome/phylogeny', lineageController.getPhylogeny);
router.get('/genome/alleles', lineageController.getAlleles);
router.post('/genome/crossover', requirePermission('workspace:write'), lineageController.performCrossover);
router.post('/genome/synthesize', requirePermission('workspace:write'), lineageController.synthesizeGenome);
router.post('/genome/decision', requirePermission('workspace:write'), lineageController.recordDecision);

module.exports = router;
