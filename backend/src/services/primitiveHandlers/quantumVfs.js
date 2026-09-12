/**
 * @file quantumVfs.js
 * @description Handlers de primitives de stratégie pour le Quantum VFS.
 * Permet aux agents autonomes, essaims et coordinateurs d'invoquer les 7 piliers
 * quantiques durant l'exécution de stratégies GenOS.
 */

const quantumVfsService = require('../quantumVfsService');
const { ObservableTrigger, EntanglementMode } = require('../quantumVfs');

async function quantumVfsStage(context = {}) {
  const workspaceId = context.workspaceId || context.workspace_id || 'default_workspace';
  const filePath = context.filePath || context.path || context.file;
  const content = context.content !== undefined ? context.content : '';
  const options = context.options || {};

  if (!filePath) {
    return { success: false, error: 'filePath est requis pour quantum_vfs_stage.' };
  }

  try {
    const result = quantumVfsService.stageQuantumFile(workspaceId, filePath, content, options);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function quantumVfsSuperpose(context = {}) {
  const workspaceId = context.workspaceId || context.workspace_id || 'default_workspace';
  const filePath = context.filePath || context.path || context.file;
  const label = context.label || context.hypothesis || 'speculative_branch';
  const content = context.content !== undefined ? context.content : '';
  const weight = Number(context.weight) || 1.0;
  const metadata = context.metadata || {};

  if (!filePath || !label) {
    return { success: false, error: 'filePath et label sont requis pour quantum_vfs_superpose.' };
  }

  try {
    const result = quantumVfsService.superposeHypothesis(workspaceId, filePath, label, content, weight, metadata);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function quantumVfsEntangle(context = {}) {
  const workspaceId = context.workspaceId || context.workspace_id || 'default_workspace';
  const pathA = context.pathA || context.sourcePath;
  const pathB = context.pathB || context.targetPath;
  const mode = context.mode || EntanglementMode.INTERFACE_IMPLEMENTATION;
  const rules = Array.isArray(context.rules) ? context.rules : [];

  if (!pathA || !pathB) {
    return { success: false, error: 'pathA et pathB sont requis pour quantum_vfs_entangle.' };
  }

  try {
    const result = quantumVfsService.entangleFiles(workspaceId, pathA, pathB, mode, rules);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function quantumVfsTunnelWrite(context = {}) {
  const workspaceId = context.workspaceId || context.workspace_id || 'default_workspace';
  const filePath = context.filePath || context.path || context.file;
  const content = context.content !== undefined ? context.content : '';
  const energy = Number(context.energy || context.agentEnergy) || 1.0;

  if (!filePath) {
    return { success: false, error: 'filePath est requis pour quantum_vfs_tunnel_write.' };
  }

  try {
    const result = quantumVfsService.tunnelWrite(workspaceId, filePath, content, energy);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function quantumVfsDecoherence(context = {}) {
  const workspaceId = context.workspaceId || context.workspace_id || 'default_workspace';
  const trigger = context.trigger || ObservableTrigger.PERSISTENCE_FLUSH;
  const options = context.options || {
    strategy: context.strategy || 'highest_probability',
    writeToDisk: context.writeToDisk !== false
  };

  try {
    const result = await quantumVfsService.triggerDecoherence(workspaceId, trigger, options);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function quantumVfsMetrics(context = {}) {
  const workspaceId = context.workspaceId || context.workspace_id || 'default_workspace';
  try {
    const result = quantumVfsService.getMetrics(workspaceId);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  quantumVfsStage,
  quantumVfsSuperpose,
  quantumVfsEntangle,
  quantumVfsTunnelWrite,
  quantumVfsDecoherence,
  quantumVfsCollapse: quantumVfsDecoherence,
  quantumVfsMetrics
};
