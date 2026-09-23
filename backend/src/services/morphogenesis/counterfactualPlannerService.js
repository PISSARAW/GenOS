'use strict';

/**
 * @deprecated Use backend/src/services/counterfactual/counterfactualPlanner.js
 * This module re-exports the consolidated Counterfactual Runtime.
 */

const counterfactualPlanner = require('../../counterfactual/counterfactualPlanner');

module.exports = {
  runCounterfactualLifecycle: counterfactualPlanner.runCounterfactualLifecycle,
  forkWorlds: counterfactualPlanner.forkWorlds,
  sealWorld: counterfactualPlanner.sealWorld,
  snapshotProductionState: counterfactualPlanner.snapshotProductionState,
  getWorld: counterfactualPlanner.getWorld,
  listWorlds: counterfactualPlanner.listWorlds,
  getExperiment: counterfactualPlanner.getExperiment,
  listExperiments: counterfactualPlanner.listExperiments,
  getLineageEdges: counterfactualPlanner.getLineageEdges,
  getStats: counterfactualPlanner.getStats,
  COUNTERFACTUAL_TYPES: counterfactualPlanner.COUNTERFACTUAL_TYPES,
  WORLD_STATUS: counterfactualPlanner.WORLD_STATUS,
  EXPERIMENT_STATUS: counterfactualPlanner.EXPERIMENT_STATUS,
};
