const assert = require('node:assert/strict');
const quorum = require('../src/services/hierarchicalQuorumService');
const biocenose = require('../src/services/biocenoseService');

assert.deepEqual(quorum.planForAgentCount(100), {
  agentCount: 100, clusterSize: 10, clusterCount: 10, fanout: 2,
  levels: 2, strategy: 'local_quorum_then_global_quorum'
});
assert.equal(quorum.summarizeVotes([
  { value: 'ship' }, { value: 'ship' }, { value: 'hold' }
]).reached, false);
assert.equal(quorum.reduceClusterVotes([
  { value: 'ship' }, { value: 'ship' }, { value: 'ship' }
]).reached, true);
assert.equal(biocenose.composeBiocenose('test', { agentCount: 100 }).communicationPlan.clusterCount, 10);
console.log('Hierarchical quorum checks passed.');
