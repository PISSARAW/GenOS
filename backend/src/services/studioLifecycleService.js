'use strict';
const { randomUUID } = require('crypto');
const instanceId = randomUUID();
let draining = false;

async function table(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS studio_restart_requests (
    id TEXT PRIMARY KEY, instance_id TEXT NOT NULL, organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL, requested_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
}

async function status(db, scope) {
  await table(db);
  await db.get('SELECT 1 AS ready');
  const operation = scope.operationId ? await db.get(
    'SELECT * FROM studio_restart_requests WHERE id=? AND organization_id=? AND project_id=?',
    scope.operationId, scope.organizationId, scope.projectId) : null;
  return { version: 1, instanceId, pid: process.pid, ready: !draining,
    mcpHalted: require('./circuitBreaker').getStatus().isHalted,
    supervised: process.env.GENOS_STUDIO_SUPERVISED === '1' && process.connected === true && typeof process.send === 'function',
    operation: operation ? { id: operation.id, state: operation.instance_id === instanceId ? 'requested' : 'completed',
      previousInstanceId: operation.instance_id, createdAt: operation.created_at } : null };
}

async function restart(db, req) {
  if (!req.user?.permissions?.includes('all')) throw Object.assign(new Error('Redémarrage global réservé aux administrateurs.'), { status: 403, code: 'GLOBAL_CONTROL_REQUIRES_ADMIN' });
  if (req.body?.confirmed !== true) throw Object.assign(new Error('Confirmation explicite requise.'), { status: 409, code: 'CONFIRMATION_REQUIRED' });
  if (!req.tenant) throw Object.assign(new Error('Projet explicite requis.'), { status: 403, code: 'TENANT_SCOPE_REQUIRED' });
  if (!(await status(db, req.tenant)).supervised) throw Object.assign(new Error('Lancer node backend/bin/genos-studio-supervisor.cjs pour activer le redémarrage.'), { status: 503, code: 'STUDIO_SUPERVISOR_UNAVAILABLE' });
  if (draining) throw Object.assign(new Error('Redémarrage déjà demandé.'), { status: 409, code: 'STUDIO_RESTART_PENDING' });
  draining = true;
  try {
    require('./circuitBreaker').triggerHalt('Studio restart drain', req.user.keyId || 'studio');
    const stopped = await require('./studioStopService').stopAll(db);
    const id = randomUUID();
    await db.run('INSERT INTO studio_restart_requests (id,instance_id,organization_id,project_id,requested_by) VALUES (?,?,?,?,?)',
      id, instanceId, req.tenant.organizationId, req.tenant.projectId, req.user.keyId || req.user.username || 'admin');
    return { version: 1, instanceId, operationId: id, state: 'requested', stopped };
  } catch (error) { draining = false; throw error; }
}

function admission(req, res, next) {
  if (draining && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return res.status(503).json({ error: { code: 'STUDIO_RESTART_PENDING', message: 'Le backend prépare son arrêt.' } });
  }
  next();
}

module.exports = { status, restart, admission };
