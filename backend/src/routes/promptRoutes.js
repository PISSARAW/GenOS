const express = require('express');
const router = express.Router();
const controller = require('../controllers/promptController');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
router.use(requireTenantScope());

router.get('/', controller.listPrompts);
router.get('/jobs', controller.listJobs);
router.get('/jobs/:id/stream', controller.streamJob);
router.post('/', requirePermission('workspace:write'), controller.createPrompt);
router.get('/:id', controller.getPrompt);
router.post('/:id/versions', requirePermission('workspace:write'), controller.createVersion);
router.post('/:id/render', controller.renderPrompt);
router.post('/playground', requirePermission('experiment:run'), controller.playground);
module.exports = router;
