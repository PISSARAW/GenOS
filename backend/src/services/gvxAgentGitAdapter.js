'use strict';

const agentGit = require('./agentGitService');

function validateBindings(bindings) {
  if (!bindings || typeof bindings.requestFor !== 'function'
      || typeof bindings.resolveParent !== 'function' || typeof bindings.applyCandidate !== 'function'
      || typeof bindings.evaluateBranch !== 'function') throw new Error('agentgit-lineage-bindings-required');
}

async function createBranch(bindings, context) {
  const { candidate, index } = context;
  const resolved = await bindings.resolveParent({ candidate });
  if (!resolved?.req?.body?.agentId || resolved.expectedParentHash !== candidate.parentHash
      || !resolved.agentGitObjectId) throw new Error('agentgit-parent-binding-invalid');
  const branchName = `gvx-candidate-${candidate.candidateId}-${index}`.slice(0, 100);
  const req = await bindings.requestFor({ candidate, branchName, resolved });
  if (req?.body?.agentId !== resolved.req.body.agentId) throw new Error('agentgit-tenant-binding-invalid');
  const result = await agentGit.speciation({ ...req, body: { ...req.body, branchName } });
  if (result?.success !== true || result.parentCommitId !== resolved.agentGitObjectId) throw new Error('agentgit-branch-creation-failed');
  return { branchId: result.branchName, agentId: req.body.agentId, production: false,
    maxCost: context.maxCost, maxSeconds: context.maxSeconds, parentCommitId: result.parentCommitId };
}

function createLineageAdapters(bindings) {
  validateBindings(bindings);
  return {
    createCandidateBranch: (context) => createBranch(bindings, context),
    evaluate: async (context) => {
      await bindings.applyCandidate({ branch: context.branch, candidate: context.candidate,
        maxCost: context.maxCost, maxSeconds: context.maxSeconds });
      return bindings.evaluateBranch({ branch: context.branch, candidate: context.candidate,
        verifierProfile: context.verifierProfile, maxCost: context.maxCost, maxSeconds: context.maxSeconds });
    }
  };
}

module.exports = { createLineageAdapters, validateBindings, createBranch };
