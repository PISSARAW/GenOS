'use strict';

const path = require('node:path');
const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');
const collective = require('../collectiveStateService');
const snapshots = require('../morphogenesis/morphogenesisTransitionSnapshotService');

function persist(input, coordinator) {
  const db = coordinator.store.db;
  db.exec('CREATE TABLE IF NOT EXISTS mission_native_morph_bindings (snapshot_id TEXT PRIMARY KEY,body TEXT NOT NULL,digest TEXT NOT NULL)');
  const body = { agentId: input.ctx.agentId, missionId: input.ctx.missionId, transitionId: input.ctx.transitionId,
    tenant: input.ctx.req.tenant, principal: input.ctx.req.user.keyId || input.ctx.req.user.username,
    plan: input.ctx.plan, snapshot: input.snapshot, authority: input.authority };
  const prior = db.prepare('SELECT digest FROM mission_native_morph_bindings WHERE snapshot_id=?').get(input.snapshot.id);
  if (prior && prior.digest !== digest(body)) throw new Error('MISSION_MORPH_NATIVE_BINDING_CONFLICT');
  db.prepare('INSERT OR IGNORE INTO mission_native_morph_bindings VALUES(?,?,?)').run(input.snapshot.id, JSON.stringify(body), digest(body));
}

async function resume(options) {
  const stored = await snapshots.load({ db: options.db, id: options.snapshotId });
  const actual = [stored.row.organization_id, stored.row.project_id, stored.row.principal_id];
  const requested = [options.req?.tenant?.organizationId, options.req?.tenant?.projectId,
    options.req?.user?.keyId || options.req?.user?.username];
  if (digest(actual) !== digest(requested)) throw new Error('MISSION_MORPH_RECOVERY_SCOPE_REJECTED');
  if (stored.row.status !== 'committed') throw new Error('MISSION_MORPH_NATIVE_RECOVERY_REQUIRES_COMMITTED_EFFECT');
  const input = { ctx: { db: options.db, req: options.req, missionId: stored.row.mission_id } };
  const folder = await require('./morphTransition').directory(input);
  const db = new Database(path.join(folder, 'coordinator.sqlite'), { readonly: true });
  let binding;
  try {
    const row = db.prepare('SELECT body,digest FROM mission_native_morph_bindings WHERE snapshot_id=?').get(options.snapshotId);
    if (!row || digest(JSON.parse(row.body)) !== row.digest) throw new Error('MISSION_MORPH_RECOVERY_BINDING_MISSING');
    binding = JSON.parse(row.body);
  } finally { db.close(); }
  const storage = require('../morphogenesis/collectiveStorage');
  const state = await storage.read(options.db, storage.key({ missionId: stored.row.mission_id,
    storageKey: stored.payload.collectiveStorageKey }));
  if (!state) throw new Error('MISSION_MORPH_RECOVERY_STATE_MISSING');
  Object.assign(input, { snapshot: binding.snapshot, authority: binding.authority,
    preState: collective.deserializeState(stored.payload.collectiveState) });
  Object.assign(input.ctx, { agentId: binding.agentId, transitionId: binding.transitionId, plan: binding.plan,
    collectiveState: collective.deserializeState(state.value) });
  return require('./morphTransition').execute(input, () => { throw new Error('MISSION_MORPH_RECOVERY_CANNOT_REDISPATCH'); });
}

module.exports = { persist, resume };
