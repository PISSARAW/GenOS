const express = require('express');
const router = express.Router();
const controller = require('../controllers/promptController');
const { requirePermission } = require('../middleware/auth');

router.get('/', controller.listPrompts);
router.post('/', requirePermission('workspace:write'), controller.createPrompt);
router.get('/:id', controller.getPrompt);
router.post('/:id/versions', requirePermission('workspace:write'), controller.createVersion);
router.post('/:id/render', controller.renderPrompt);
router.post('/playground', requirePermission('experiment:run'), controller.playground);
module.exports = router;
