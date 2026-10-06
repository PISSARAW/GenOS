'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { managedRoot, assertCandidate } = require('./worktreeService');
const { treeHash } = require('./proofService');
const { runCommand } = require('../agentWorkspaceLifecycle/git');
const { resolveContainedPathNoSymlinkSync } = require('../pathSafety');
const { requireProject } = require('./operatorService');
const { acquireClaim, releaseClaim, extendClaim } = require('./claimService');

function retentionDays(value) {
  const days = value ?? 30;
  if (!Number.isSafeInteger(days) || days < 0) throw new Error('retention-invalide');
  return days;
}

async function purgeCapsule(project, result, fence) {
  if (!result.candidateWorktree || !result.treeHash) return false;
  const target = assertCandidate(project, result.candidateWorktree);
  if (!fs.existsSync(target)) return false;
  if (await treeHash(target) !== result.treeHash) throw new Error('capsule-modifiee-conservee');
  await fence();
  await runCommand('git', ['worktree', 'remove', '--force', target], { cwd: project.root_path });
  return true;
}

function purgeRequest(project, run) {
  if (!/^onto_run_[a-z0-9_-]+$/i.test(run.id)) return false;
  const target = resolveContainedPathNoSymlinkSync(managedRoot(project), `requests/${run.id}.json`);
  if (!fs.existsSync(target)) return false;
  if (!fs.statSync(target).isFile()) throw new Error('requete-fichier-regulier-requis');
  fs.unlinkSync(target);
  return true;
}

async function collectArtifacts(db, project, input) {
  const days = retentionDays(input.olderThanDays);
  const runs = await db.all(`SELECT * FROM ontogenesis_execution WHERE project_id = ?
    AND phase NOT IN ('prepared','running','finished','verified')
    AND julianday(updated_at) < julianday('now', ?) ORDER BY updated_at LIMIT 100`, [project.id, `-${days} days`]);
  const result = { requests: 0, capsules: 0, retained: [] };
  for (const run of runs) {
    try {
      if (await purgeCapsule(project, JSON.parse(run.result_json), input.fence)) result.capsules += 1;
      await input.fence();
      if (purgeRequest(project, run)) result.requests += 1;
    } catch (error) { result.retained.push({ operationId: run.id, reason: error.message }); }
  }
  return result;
}

async function pruneArtifacts(db, input) {
  retentionDays(input.olderThanDays);
  const project = await requireProject(db, input.projectId);
  const owner = `prune:${randomUUID()}`;
  const claim = await acquireClaim(db, { projectId: input.projectId, owner, ttlMs: 120000 });
  if (!claim.acquired) throw new Error('claim-actif');
  const lease = { projectId: input.projectId, owner, operationId: claim.operationId, ttlMs: 120000 };
  const fence = () => extendClaim(db, lease);
  const heartbeat = setInterval(() => { fence().catch(() => {}); }, 10000);
  heartbeat.unref();
  try { return await collectArtifacts(db, project, { ...input, fence }); }
  finally {
    clearInterval(heartbeat);
    await releaseClaim(db, lease);
  }
}

module.exports = { retentionDays, pruneArtifacts };
