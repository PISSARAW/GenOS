/**
 * GenOS Trajectories Routes
 */

const express = require('express');
const router = express.Router();
const trajectoryController = require('../controllers/trajectoryController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');

router.get('/', trajectoryController.getTrajectories);
router.get('/pending', trajectoryController.getPending);
router.get('/active', trajectoryController.getActive);
router.post('/', requirePermission('workspace:write'), requireTenantScope({ write: true }), trajectoryController.createTrajectory);
router.post('/:id/approve', requirePermission('workspace:write'), requireTenantScope({ write: true }), trajectoryController.approveTrajectory);
router.post('/:id/reject', requirePermission('workspace:write'), requireTenantScope({ write: true }), trajectoryController.rejectTrajectory);
router.post('/:id/revise', requirePermission('workspace:write'), requireTenantScope({ write: true }), trajectoryController.reviseTrajectory);

module.exports = router;
