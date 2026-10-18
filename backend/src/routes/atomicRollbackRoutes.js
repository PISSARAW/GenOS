const express = require('express');
const atomicRollbackService = require('../services/atomicRollbackService');

const router = express.Router();

router.post('/plans', (req, res) => {
  try {
    const plan = atomicRollbackService.buildAtomicRollbackPlan(req.body || {});
    res.status(201).json({ ok: true, plan });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'ATOMIC_ROLLBACK_INVALID' });
  }
});

router.post('/plans/:id/operations', (req, res) => {
  try {
    const { id } = req.params;
    const current = { schema: atomicRollbackService.SCHEMA, plan_id: id, status: 'prepared', operations: [], invariants: [] };
    const updated = atomicRollbackService.addOperation(current, req.body || {});
    res.json({ ok: true, plan: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'ATOMIC_ROLLBACK_OPERATION_FAILED' });
  }
});

router.post('/plans/:id/invariants', (req, res) => {
  try {
    const { id } = req.params;
    const current = { schema: atomicRollbackService.SCHEMA, plan_id: id, status: 'prepared', operations: [], invariants: [] };
    const updated = atomicRollbackService.addInvariant(current, req.body || {});
    res.json({ ok: true, plan: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'ATOMIC_ROLLBACK_INVARIANT_FAILED' });
  }
});

router.post('/plans/:id/commit', (req, res) => {
  try {
    const { id } = req.params;
    const current = { schema: atomicRollbackService.SCHEMA, plan_id: id, status: 'prepared', operations: [], invariants: [] };
    const result = atomicRollbackService.commitAtomicRollback(current, req.body && req.body.committedAt);
    if (!result.ok) {
      return res.status(409).json({ ok: false, reason: result.reason, results: result.results, code: 'ATOMIC_ROLLBACK_COMMIT_BLOCKED' });
    }
    res.json({ ok: true, plan: result.plan, receipt: result.receipt });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'ATOMIC_ROLLBACK_COMMIT_FAILED' });
  }
});

router.post('/plans/:id/rollback', (req, res) => {
  try {
    const { id } = req.params;
    const current = { schema: atomicRollbackService.SCHEMA, plan_id: id, status: 'prepared', operations: [], invariants: [] };
    const result = atomicRollbackService.rollbackAtomic(current, req.body && req.body.rolledBackAt);
    res.json({ ok: true, plan: result.plan, compensation_operations: result.compensation_operations });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'ATOMIC_ROLLBACK_FAILED' });
  }
});

module.exports = router;
