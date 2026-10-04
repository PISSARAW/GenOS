const express = require('express');
const { requirePermission } = require('../middleware/auth');
const { requireTenantScope } = require('../middleware/tenant');
const { getDatabase } = require('../db');
const delivery = require('../services/signalDeliveryService');
const transport = require('../services/signalingTransportService');
const inbox = require('../services/signalInboxService');
const router = express.Router();

function requireExplicitScope(req, res, next) {
  if (!req.tenant) {
    return res.status(400).json({ error: { code: 'TENANT_SCOPE_REQUIRED', message: 'Organization and project headers are required.' } });
  }
  next();
}

async function scopedAgent(db, scope, agentId) {
  if (!agentId) return false;
  const row = await db.get(
    `SELECT a.id FROM agents a JOIN workspaces w ON w.id = a.workspace_id
     WHERE a.id = ? AND w.organization_id = ? AND w.project_id = ?`,
    agentId, scope.organizationId, scope.projectId
  );
  return Boolean(row);
}

router.use(requirePermission('security:manage'), requireTenantScope(), requireExplicitScope);

router.post('/subscriptions', requireTenantScope({ write: true }), async (req, res, next) => {
  try {
    const db = await getDatabase();
    if (!await scopedAgent(db, req.tenant, req.body?.agentId)) return res.status(404).json({ subscribed: false });
    const subscribed = await delivery.subscribeAgent(db, req.body.agentId, req.body.topic);
    res.status(subscribed ? 200 : 400).json({ subscribed });
  } catch (error) { next(error); }
});

router.delete('/subscriptions', requireTenantScope({ write: true }), async (req, res, next) => {
  try {
    const db = await getDatabase();
    if (!await scopedAgent(db, req.tenant, req.query.agentId)) return res.status(404).json({ removed: false });
    const removed = await delivery.unsubscribeAgent(db, req.query.agentId, req.query.topic);
    res.json({ removed });
  } catch (error) { next(error); }
});

router.get('/inbox/:agentId', async (req, res, next) => {
  try {
    const db = await getDatabase();
    if (!await scopedAgent(db, req.tenant, req.params.agentId)) return res.status(404).json({ signals: [] });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 100));
    const since = req.query.since || null;
    const delivered = await inbox.readDeliveredInbox(db, req.tenant, { agentId: req.params.agentId, since, limit });
    const unread = await transport.readSignalsForAgent(req.params.agentId, since, limit);
    const signals = [...delivered, ...unread]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    await transport.markSignalsSeen(req.params.agentId, signals.map((item) => item.signalId));
    res.json({ signals });
  } catch (error) { next(error); }
});

router.post('/deliveries/:signalId/ack', requireTenantScope({ write: true }), async (req, res, next) => {
  try {
    const db = await getDatabase();
    if (!await scopedAgent(db, req.tenant, req.body?.agentId)) return res.status(404).json({ acknowledged: false });
    const acknowledged = await inbox.ackScopedDelivery(db, req.tenant, {
      signalId: req.params.signalId, agentId: req.body.agentId
    });
    res.status(acknowledged ? 200 : 409).json({ acknowledged });
  } catch (error) { next(error); }
});

module.exports = router;
