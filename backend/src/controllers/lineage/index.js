/**
 * GenOS Lineage DAG & Genome Controller
 */

const { getLineage, inspectNode, getGenomeGraph, synthesizeGenome, recordDecision } = require('./queries');
const { diffAgents } = require('./diff');
const { mergeAgents } = require('./merge');
const { snapshotAgentState, commitAgentState, branchAgentState, checkoutAgentState, restoreAgentState } = require('./snapshots');
const { cherryPickAgentState } = require('./cherryPick');
const { replayAgentState, bisectAgentState } = require('./replay');
const { cloneNode } = require('./clone');
const { killNode } = require('./kill');
const { getPhylogeny, getAlleles, performCrossover } = require('./genetics');

module.exports = {
  getLineage,
  inspectNode,
  diffAgents,
  mergeAgents,
  snapshotAgentState,
  commitAgentState,
  branchAgentState,
  checkoutAgentState,
  cherryPickAgentState,
  restoreAgentState,
  replayAgentState,
  bisectAgentState,
  cloneNode,
  killNode,
  getGenomeGraph,
  synthesizeGenome,
  recordDecision,
  getPhylogeny,
  getAlleles,
  performCrossover
};
