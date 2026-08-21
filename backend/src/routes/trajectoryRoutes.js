/**
 * GenOS Trajectories Routes
 */

const express = require('express');
const router = express.Router();
const trajectoryController = require('../controllers/trajectoryController');
const { requirePermission } = require('../middleware/auth');

router.get('/', trajectoryController.getTrajectories);
router.get('/pending', trajectoryController.getPending);
router.get('/active', trajectoryController.getActive);
router.post('/', requirePermission('workspace:write'), trajectoryController.createTrajectory);
router.post('/:id/approve', requirePermission('workspace:write'), trajectoryController.approveTrajectory);
router.post('/:id/reject', requirePermission('workspace:write'), trajectoryController.rejectTrajectory);
router.post('/:id/revise', requirePermission('workspace:write'), trajectoryController.reviseTrajectory);

module.exports = router;
