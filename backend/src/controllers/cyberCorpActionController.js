'use strict';

const gateway = require('../services/cyberCorpActionGateway/gateway');
const { validateRequest } = require('../services/cyberCorpActionGateway/catalog');

function list(_req, res) {
  res.json({ success: true, actions: gateway.listOperations() });
}

async function execute(req, res) {
  const invalid = validateRequest(req.body);
  if (invalid) return res.status(400).json({ success: false, error: { code: invalid } });
  try {
    const result = await gateway.execute({ request: req.body, actor: { id: req.user?.keyId },
      tenant: req.tenant?.projectId || req.tenant?.organizationId || null });
    return res.status(200).json(result);
  } catch (error) {
    const status = errorStatus(error.code);
    return res.status(status).json({ success: false, error: { code: error.code || 'ACTION_FAILED' } });
  }
}

function errorStatus(code) {
  if (['MANDATE_INVALID_OR_EXPIRED', 'HUMAN_APPROVAL_REQUIRED', 'OPERATION_PROHIBITED'].includes(code)) return 403;
  if (['CURRENT_STATE_STALE', 'PRECONDITIONS_FAILED', 'ACTION_ALREADY_APPLIED', 'VERIFIED_ROLLBACK_REQUIRED',
    'IDEMPOTENCY_CONFLICT', 'OUTCOME_UNCERTAIN'].includes(code)) return 409;
  if (code === 'GATEWAY_NOT_CONFIGURED') return 503;
  return 500;
}

module.exports = { execute, list };
