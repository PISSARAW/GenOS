/**
 * Rust Core Bridge Routes
 *
 * Studio's window onto the real genos-cli: snapshot creation, hallucination
 * analysis, replay and diffing. Mutating operations require write access;
 * analysis stays readable.
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/rustBridgeController');
const { requirePermission } = require('../middleware/auth');

router.get('/status', requirePermission('read'), controller.getStatus);
router.get('/snapshots', requirePermission('read'), controller.listSnapshots);
router.post('/snapshots', requirePermission('workspace:write'), controller.createSnapshot);
router.post('/hallucination/:op(detect|analyze|extract)', requirePermission('read'), controller.runHallucination);
router.post('/hallucination/simulate', requirePermission('experiment:run'), controller.simulateHallucination);
router.post('/replay', requirePermission('experiment:run'), controller.replayBranch);
router.post('/diff', requirePermission('read'), controller.diffSnapshots);

module.exports = router;
