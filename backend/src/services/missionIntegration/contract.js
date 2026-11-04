'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('../qualityElevation/qualityContract');

const fail = code => Object.assign(new Error(code), { code });
function integer(value, bounds) {
  if (!Number.isSafeInteger(value) || value < bounds[0] || value > bounds[1]) throw fail('MISSION_MECHANISMS_LIMIT_INVALID');
  return value;
}
function baselinePath(root, value) {
  if (typeof value !== 'string' || !value.trim() || path.isAbsolute(value) || /[:\0]/.test(value)) {
    throw fail('MISSION_MECHANISMS_BASELINE_PATH_INVALID');
  }
  const resolved = fs.realpathSync(path.resolve(root, value));
  const relative = path.relative(fs.realpathSync(root), resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw fail('MISSION_MECHANISMS_BASELINE_OUTSIDE_WORKSPACE');
  }
  const bytes = fs.readFileSync(resolved);
  if (!fs.statSync(resolved).isFile() || bytes.length > 1024 * 1024) throw fail('MISSION_MECHANISMS_BASELINE_LIMIT');
  return { path: resolved, sha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex') };
}
function assertOptions(request) {
  const obligations = [request.morphogenesis === true, request.adaptiveMorphogenesis?.requireTransition === true,
    request.gqwf_v2 === true || request.executionPolicy?.gqwfV2 === true, request.qualityRuntime?.planScenes === true,
    request.relationalPolicy?.version === 1 && request.relationalPolicy.required === true,
    process.env.GENOS_AGENT_DNA === '1', require('../globalWorkspaceService').getMode() === 'bounded'];
  if (!obligations.every(Boolean)) throw fail('MISSION_MECHANISMS_REQUIRED_POLICY_MISSING');
  if (!process.env.GENOS_MISSION_RESEARCH_AUTHORITY_PRIVATE_KEY_PEM) throw fail('MISSION_MECHANISMS_RESEARCH_AUTHORITY_REQUIRED');
}
function normalize(input) {
  const raw = input.context.request.missionMechanisms;
  if (!raw) return null;
  if (raw.version !== 1 || raw.required !== true || typeof raw.exerciseContextRecovery !== 'boolean') {
    throw fail('MISSION_MECHANISMS_CONTRACT_INVALID');
  }
  assertOptions(input.context.request);
  const quality = input.context.request.qualityElevation;
  const requirements = require('../endogenousThoughtMissionContract').normalize({
    organizationId: input.parent.organization_id, projectId: input.parent.project_id,
    agentId: input.context.orchestratorId, missionId: input.context.missionId,
    artifact: baselinePath(input.parent.workspace_root, raw.baselinePath),
    requirements: { minWords: quality?.minBodyWords, minScenes: quality?.minSceneCount,
      maxScenes: quality?.maxSceneCount, requireDialogue: quality?.requireDialogue },
    budget: { tokens: 1000, usd: 0, seconds: integer(raw.researchBudgetSeconds ?? 120, [1, 300]) } });
  return { schema: 'genos.mission-mechanisms-contract/v1', version: 1, required: true,
    exerciseContextRecovery: raw.exerciseContextRecovery, baselinePath: raw.baselinePath,
    artifact: requirements.artifact, requirements: requirements.requirements,
    researchBudget: requirements.budget, maxPreparationMs: integer(raw.maxPreparationMs ?? 180000, [1000, 600000]),
    originalMissionDigest: digest(input.context.task) };
}
function normalizeCanonical(value) {
  if (value == null) return null;
  if (value.contract?.schema !== 'genos.mission-mechanisms-contract/v1' || value.contract.required !== true
    || value.contractDigest !== digest(value.contract)) {
    throw fail('MISSION_MECHANISMS_CANONICAL_INVALID');
  }
  assertCanonicalReferences(value);
  return structuredClone(value);
}
function assertCanonicalReferences(value) {
  if (!/^mission-mechanisms-[a-f0-9]{64}$/.test(value.receiptRef || '')
    || !/^[a-f0-9]{64}$/.test(value.receiptDigest || '') || !/^[a-f0-9]{64}$/.test(value.contextDigest || '')) {
    throw fail('MISSION_MECHANISMS_CANONICAL_INVALID');
  }
}
function canonicalFields(request) {
  return request.missionMechanisms ? { missionMechanisms: normalizeCanonical(request.missionMechanisms) } : {};
}
function assertUnchanged(current, next) {
  if (digest(current.missionMechanisms ?? null) !== digest(next.missionMechanisms ?? null)) {
    throw fail('MISSION_MECHANISMS_CONTRACT_CHANGED');
  }
}
module.exports = { fail, digest, normalize, normalizeCanonical, canonicalFields, assertUnchanged };
