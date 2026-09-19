'use strict';

const express = require('express');
const crypto = require('crypto');
const { getDatabase } = require('../db');
const { requireRole } = require('../middleware/auth');
const { validatePolicy } = require('../services/iamPolicyEngine');

const router = express.Router();
router.use(requireRole(['admin']));

function policyScope(body, user) {
  const organizationId = String(body.organizationId || '').trim() || null;
  const projectId = String(body.projectId || '').trim() || null;
  if (Boolean(organizationId) !== Boolean(projectId)) throw new Error('Organization and project scope must be provided together.');
  if ((organizationId || projectId) && !user.permissions.includes('all')) throw new Error('Only global administrators can manage tenant policy scopes.');
  return { organizationId, projectId };
}

function parsePolicy(body) {
  const id = String(body.id || `policy-${crypto.randomUUID()}`);
  const name = String(body.name || '').trim();
  if (!name || name.length > 120) throw new Error('Policy name is required and must be at most 120 characters.');
  return { id, name, policy: validatePolicy(body.policy) };
}

router.get('/', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const rows = await db.all('SELECT id, name, enabled, policy_json, organization_id, project_id, updated_at FROM iam_policies ORDER BY name');
    res.json(rows.map((row) => ({ ...row, policy: JSON.parse(row.policy_json), policy_json: undefined })));
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { id, name, policy } = parsePolicy(req.body || {});
    const scope = policyScope(req.body || {}, req.user);
    await db.run('INSERT INTO iam_policies (id, name, enabled, policy_json, organization_id, project_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, name, policy.enabled ? 1 : 0, JSON.stringify(policy), scope.organizationId, scope.projectId, req.user.keyId || req.user.username);
    res.status(201).json({ id, name, enabled: policy.enabled, ...scope });
  } catch (error) { res.status(400).json({ error: { code: 'INVALID_IAM_POLICY', message: error.message } }); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const { name, policy } = parsePolicy({ ...(req.body || {}), id: req.params.id });
    const scope = policyScope(req.body || {}, req.user);
    const result = await db.run('UPDATE iam_policies SET name = ?, enabled = ?, policy_json = ?, organization_id = ?, project_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      name, policy.enabled ? 1 : 0, JSON.stringify(policy), scope.organizationId, scope.projectId, req.params.id);
    if (!result.changes) return res.status(404).json({ error: { code: 'IAM_POLICY_NOT_FOUND' } });
    res.json({ id: req.params.id, name, enabled: policy.enabled, ...scope });
  } catch (error) { res.status(400).json({ error: { code: 'INVALID_IAM_POLICY', message: error.message } }); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const db = await getDatabase();
    const result = await db.run('DELETE FROM iam_policies WHERE id = ?', req.params.id);
    if (!result.changes) return res.status(404).json({ error: { code: 'IAM_POLICY_NOT_FOUND' } });
    res.status(204).end();
  } catch (error) { next(error); }
});

module.exports = router;
