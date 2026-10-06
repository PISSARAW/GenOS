'use strict';
const store = require('./axolotlStateStore');
const MODE_ROLE = Object.freeze({ sensory_input: 'boundary_scout', entry_point: 'boundary_scout',
  processing: 'capability_offshoot', execution: 'parallel_executor', effector: 'parallel_executor',
  memory: 'integration_observer', coordination: 'rootless_coordinator' });
async function compose(input) {
  const topologyService = require('./axolotlTopologyService');
  const mode = await topologyService.getTopologyModeDurable(input.orchestratorId, { db: input.db });
  if (!input.db) return { mode: mode.mode, plastique: mode.mode === 'plastique',
    members: require('./biologicalModeService').compose('axolotl', input.mission), modeInfo: mode, runtimeStatus: 'awaiting_regeneration' };
  await store.assertOwner(input.db, input.orchestratorId);
  const active = await store.activeTopology(input.db, input.orchestratorId);
  if (!active?.evidenceRef) return { mode: mode.mode, plastique: mode.mode === 'plastique', modeInfo: mode,
    members: require('./biologicalModeService').compose('axolotl', input.mission), runtimeStatus: 'awaiting_regeneration' };
  const proof = await store.evidence(input.db, active.evidenceRef);
  if (!proof.result.passed || proof.subjectHash !== store.hash(active.topology)) throw store.error('AXOLOTL_COMPOSITION_EVIDENCE_INVALID');
  const composition = { mode: mode.mode, plastique: mode.mode === 'plastique', modeInfo: mode, topology: active.topology,
    topologyVersion: active.version, evidenceRef: active.evidenceRef, runtimeStatus: 'adopted',
    members: active.topology.components.map((node) => ({ label: node.id, componentId: node.id, componentRole: node.role,
      role: MODE_ROLE[node.role] || 'capability_offshoot', modelTier: 'standard', about: `Operate the ${node.role} capability for ${input.mission}` })) };
  return require('./topologyWorkerKindService').applyTopologyWorkerKinds('axolotl', composition, input.workerAssignments || input.options?.workerAssignments);
}
module.exports = { compose };
