/**
 * GenOS Workspace & Causal Bisection Service (facade).
 *
 * Search lives in bisectionSearch, remediation in bisectionRemediation,
 * history helpers in bisectionHistory and workspace diff in bisectionDiff.
 */
const { MAX_BISECTION_SNAPSHOTS, remediateRollback, autoBisectWorkspaceAnomaly } = require('./bisectionRemediation');
const { bisectAnomalyAsync, bisectAnomaly } = require('./bisectionSearch');
const { diffWorkspaces } = require('./bisectionDiff');

module.exports = {
  MAX_BISECTION_SNAPSHOTS,
  diffWorkspaces,
  bisectAnomaly,
  bisectAnomalyAsync,
  remediateRollback,
  autoBisectWorkspaceAnomaly
};
