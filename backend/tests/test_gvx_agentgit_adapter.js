'use strict';

const assert = require('node:assert/strict');
const agentGit = require('../src/services/agentGitService');
const adapter = require('../src/services/gvxAgentGitAdapter');

async function main() {
  const original = agentGit.speciation;
  let branchInput;
  agentGit.speciation = async (req) => {
    branchInput = req;
    return { success: true, branchName: req.body.branchName, parentCommitId: 'commit-parent' };
  };
  try {
    const bindings = adapter.createLineageAdapters({
      resolveParent: async () => ({ req: { body: { agentId: 'agent-a' } }, expectedParentHash: 'a'.repeat(64), agentGitObjectId: 'commit-parent' }),
      requestFor: async ({ branchName }) => ({ body: { agentId: 'agent-a', branchName }, user: { username: 'test' } }),
      applyCandidate: async () => ({ applied: true }),
      evaluateBranch: async () => ({ verified: false, cost: 1 })
    });
    const branch = await bindings.createCandidateBranch({ candidate: { candidateId: 'candidate', parentHash: 'a'.repeat(64) }, index: 0, maxCost: 3, maxSeconds: 10 });
    assert.equal(branch.production, false);
    assert.equal(branch.parentCommitId, 'commit-parent');
    assert.equal(branchInput.body.agentId, 'agent-a');
    const outcome = await bindings.evaluate({ branch, candidate: {}, maxCost: 3, maxSeconds: 10 });
    assert.equal(outcome.verified, false);
  } finally { agentGit.speciation = original; }
  console.log('GVX AgentGit adapter checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
