'use strict';
function assess({ failureContext, lastSnapshot, currentTopology }) {
  if (!failureContext) return null;
  if (!failureContext.structural && lastSnapshot?.valid) return { needed: false, mode: 'restore_classic', reason: 'Snapshot valide disponible' };
  if (!failureContext.structural && !['high', 'critical'].includes(failureContext.severity)) return null;
  const damaged = failureContext.componentIds || [];
  const targeted = damaged.length > 0 && damaged.every((id) => currentTopology?.components?.some((node) => node.id === id));
  return { needed: true, structural: failureContext.structural === true,
    mode: targeted ? 'partial_regeneration' : 'global_regeneration',
    scope: targeted ? { type: 'components', componentIds: damaged } : { type: 'global' }, reason: 'Régénération fonctionnelle requise' };
}
function preferredPrimary(input) {
  const assessment = assess({ ...input, failureContext: input.failureContext || input.failure_context });
  if (!assessment) return null;
  return assessment.needed ? 'axolotl_regeneration' : 'checkpoint_regeneration';
}
module.exports = { assess, preferredPrimary };