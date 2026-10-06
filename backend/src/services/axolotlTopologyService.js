'use strict';
const store = require('./axolotlStateStore');
const regulator = require('./development/plasticityRegulatorService');
const topologyModes = new Map();
let database = null;
function setAdaptivePersister(persister) { database = persister?.db || database; }
function setStateStore(stored) {
  topologyModes.clear();
  for (const [id, entry] of stored) topologyModes.set(id, store.clone(entry));
}
function getTopologyMode(orchestratorId) {
  return { ...(topologyModes.get(orchestratorId) || { mode: 'plastique', setAt: null, defaulted: true }) };
}
async function getTopologyModeDurable(orchestratorId, input = {}) {
  const db = input.db || database;
  if (!db) return getTopologyMode(orchestratorId);
  const state = await regulator.getPlasticity(orchestratorId, { db });
  const frozen = ['STABLE', 'CONSOLIDATING'].includes(state.state);
  const mode = { mode: frozen ? 'stabilisé' : 'plastique', state: state.state, setAt: state.lastChangeAt, defaulted: !state.version };
  if (!state.version && topologyModes.get(orchestratorId)?.mode === 'stabilisé') mode.mode = 'stabilisé';
  topologyModes.set(orchestratorId, mode);
  return { ...mode };
}
async function setTopologyMode(orchestratorId, mode, options = {}) {
  const normalized = String(mode).trim().toLowerCase();
  if (!['plastique', 'plastic', 'stabilisé', 'stable'].includes(normalized)) throw store.error('AXOLOTL_MODE_INVALID');
  const to = ['stabilisé', 'stable'].includes(normalized) ? 'STABLE' : 'PLASTIC';
  const result = await regulator.requestChange({ ...options, db: options.db || database, id: orchestratorId, to,
    reason: options.reason || 'Transition explicite du mode topologique' });
  if (result.ok) await getTopologyModeDurable(orchestratorId, { db: options.db || database });
  return result;
}
function isPlastique(id) { return getTopologyMode(id).mode === 'plastique'; }
function isStabilise(id) { return getTopologyMode(id).mode === 'stabilisé'; }
async function assertMutable(input) {
  const mode = await getTopologyModeDurable(input.orchestratorId, { db: input.db });
  if (mode.mode === 'stabilisé') throw store.error('AXOLOTL_TOPOLOGY_FROZEN');
}
async function applyOrganizationMode(input = {}) {
  await assertMutable(input);
  return require('./dynamicOrganizationService').changeOrganization(input.db, {
    orchestratorId: input.orchestratorId, organization: input.organization, reason: input.reason, changedBy: input.orchestratorId
  });
}
function transitionToStabilise(id, reason, input = {}) { return setTopologyMode(id, 'stabilisé', { ...input, reason }); }
function transitionToPlastique(id, reason, input = {}) { return setTopologyMode(id, 'plastique', { ...input, reason }); }
function listTopologyModes() { return [...topologyModes].map(([orchestratorId, value]) => ({ orchestratorId, ...value })); }
function resetToDefault(id, input = {}) { return transitionToPlastique(id, 'Retour contrôlé vers plasticité', input); }
module.exports = { setAdaptivePersister, setStateStore, getTopologyMode, getTopologyModeDurable, setTopologyMode,
  isPlastique, isStabilise, assertMutable, applyOrganizationMode, transitionToStabilise, transitionToPlastique, listTopologyModes, resetToDefault };