/**
 * GenOS Lineage DAG & Genome Controller
 */

const { getLineage, inspectNode, getGenomeGraph, synthesizeGenome, recordDecision } = require('./queries');
const { diffAgents } = require('./diff');
const { mergeAgents } = require('./merge');
const { snapshotCapabilities, snapshotAgentState, commitAgentState, branchAgentState, checkoutAgentState, restoreAgentState } = require('./snapshots');
const { cherryPickAgentState } = require('./cherryPick');
const { replayAgentState, bisectAgentState } = require('./replay');
const { cloneNode, cloneFromAgent, cloneFromNode, insertClonedAgent } = require('./clone');
const { killNode } = require('./kill');
const { getPhylogeny, getAlleles, performCrossover } = require('./genetics');

module.exports = {
  getLineage,
  inspectNode,
  snapshotCapabilities,
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
  cloneFromAgent,
  cloneFromNode,
  insertClonedAgent,
  killNode,
  getGenomeGraph,
  synthesizeGenome,
  recordDecision,
  getPhylogeny,
  getAlleles,
  performCrossover
};
