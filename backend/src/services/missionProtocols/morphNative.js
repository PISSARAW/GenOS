'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const snapshots = require('../morphogenesis/morphogenesisTransitionSnapshotService');
const collective = require('../collectiveStateService');

const same = (left, right) => digest(left) === digest(right);
const raw = state => JSON.parse(collective.serializeState(state));
const comparable = state => { const copy = { ...state }; delete copy.updatedAt; return copy; };

function bounded(input) {
  if (input.ctx.plan.budgetPatch || input.ctx.plan.actions.some(action => action.type !== 'rebind')) {
    throw new Error('MISSION_MORPH_NATIVE_PROFILE_REQUIRES_REBIND_ONLY');
  }
  if (input.ctx.plan.actions.some(action => action.addCapabilities?.length)) throw new Error('MISSION_MORPH_PERMISSION_EXPANSION_REFUSED');
}

async function admitted(input) {
  const { ctx, snapshot, authority } = input;
  const stored = await snapshots.load({ db: ctx.db, id: snapshot.id });
  const tenant = ctx.req.tenant;
  if (authority.principalId !== (ctx.req.user.keyId || ctx.req.user.username)) throw new Error('MISSION_MORPH_NATIVE_PRINCIPAL_MISMATCH');
  const actual = [stored.row.organization_id, stored.row.project_id, stored.row.mission_id, stored.row.plan_hash,
    stored.row.snapshot_hash, JSON.parse(stored.row.authority_json || 'null')];
  const expected = [tenant.organizationId, tenant.projectId, ctx.missionId, snapshot.planHash, snapshot.hash, authority];
  if (!same(actual, expected) || snapshots.digest(ctx.plan) !== snapshot.planHash) throw new Error('MISSION_MORPH_NATIVE_AUTHORITY_MISMATCH');
  if (authority.decision !== 'APPLY' || !Number.isSafeInteger(authority.expiresAtUnixMs)
    || authority.expiresAtUnixMs <= Date.now()) throw new Error('MISSION_MORPH_NATIVE_AUTHORITY_EXPIRED');
  if (!['applying', 'committed', 'restored', 'recovery_required'].includes(stored.row.status)) throw new Error('MISSION_MORPH_NATIVE_ADMISSION_REQUIRED');
  return stored;
}

async function source(input) {
  const stored = await admitted(input);
  const mission = await input.ctx.db.get('SELECT status FROM missions WHERE mission_id=?', input.ctx.missionId);
  if (!mission || !['active', 'dormant'].includes(mission.status)) throw new Error('MISSION_MORPH_NATIVE_MISSION_INACTIVE');
  const ids = stored.payload.agents.map(agent => agent.id);
  for (const agent of stored.payload.agents) {
    const columns = Object.keys(agent);
    const current = await input.ctx.db.get(`SELECT ${columns.join(',')} FROM agents WHERE id=?`, agent.id);
    if (!same(current, agent)) throw new Error('MISSION_MORPH_NATIVE_AGENT_CHANGED');
  }
  if (!ids.includes(input.ctx.agentId)) throw new Error('MISSION_MORPH_NATIVE_CONTROLLER_MISSING');
  if (!same(comparable(raw(input.ctx.collectiveState)), comparable(raw(input.preState)))) throw new Error('MISSION_MORPH_NATIVE_SOURCE_CHANGED');
  const table = await input.ctx.db.get("SELECT name FROM sqlite_master WHERE name='collective_state'");
  const persisted = table && await input.ctx.db.get("SELECT value FROM collective_state WHERE key='collective_state_v1'");
  if (persisted && !same(comparable(JSON.parse(persisted.value)), comparable(raw(input.preState)))) {
    throw new Error('MISSION_MORPH_NATIVE_SOURCE_CAS_REJECTED');
  }
  return true;
}

function target(input) {
  const value = raw(input.preState);
  for (const action of input.ctx.plan.actions) {
    const agent = value.agents[action.agentId];
    if (!agent) throw new Error('MISSION_MORPH_NATIVE_MEMBER_MISSING');
    agent.role = action.targetRole || agent.role;
    agent.parent = action.targetParent ?? agent.parent;
  }
  if (input.ctx.plan.targetOrganization) value.topologyState.organization = input.ctx.plan.targetOrganization;
  if (input.ctx.plan.targetTopology) value.topologyState.topology = input.ctx.plan.targetTopology;
  value.currentMorphologyVersion += 1;
  return JSON.parse(JSON.stringify(value));
}

async function applied(input) {
  const stored = await admitted(input);
  if (stored.row.status !== 'committed') throw new Error('MISSION_MORPH_NATIVE_COMMIT_MISSING');
  const row = await input.ctx.db.get("SELECT value FROM collective_state WHERE key='collective_state_v1'");
  const expected = comparable(target(input));
  if (!row || !same(comparable(JSON.parse(row.value)), expected)
    || !same(comparable(raw(input.ctx.collectiveState)), expected)) throw new Error('MISSION_MORPH_NATIVE_POSTSTATE_MISMATCH');
  return true;
}

module.exports = { same, raw, bounded, admitted, source, target, applied };
