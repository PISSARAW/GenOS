'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

function fail(code, message) { return Object.assign(new Error(message || code), { code }); }
function digest(value) { return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex'); }
function bytesDigest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function required(value) {
  if (typeof value !== 'string' || !value.trim()) throw fail('ETT_MISSION_IDENTITY_REQUIRED');
  return value;
}
function integer(value, limits) {
  if (!Number.isSafeInteger(value) || value < limits[0] || value > limits[1]) throw fail('ETT_MISSION_LIMIT_INVALID');
  return value;
}
function requirementsOf(value = {}) {
  if (Object.keys(value).some(key => !['minWords', 'minScenes', 'maxScenes', 'requireDialogue'].includes(key))) {
    throw fail('ETT_MISSION_REQUIREMENTS_INVALID');
  }
  if (typeof value.requireDialogue !== 'boolean') throw fail('ETT_MISSION_REQUIREMENTS_INVALID');
  const requirements = { minWords: integer(value.minWords, [0, 100000]), minScenes: integer(value.minScenes, [0, 50]),
    maxScenes: integer(value.maxScenes, [1, 50]), requireDialogue: value.requireDialogue };
  if (requirements.minScenes > requirements.maxScenes) throw fail('ETT_MISSION_REQUIREMENTS_INVALID');
  return requirements;
}
function budgetOf(value) {
  const budget = { tokens: integer(value?.tokens, [1, 100000]), usd: Number(value?.usd),
    seconds: integer(value?.seconds, [1, 3600]) };
  if (!Number.isFinite(budget.usd) || budget.usd < 0) throw fail('ETT_MISSION_LIMIT_INVALID');
  return budget;
}
function normalize(input) {
  if (['verdict', 'verify', 'worker', 'sandbox'].some(key => Object.hasOwn(input || {}, key))) {
    throw fail('ETT_MISSION_EXECUTOR_FORBIDDEN');
  }
  const scope = Object.fromEntries(['organizationId', 'projectId', 'agentId', 'missionId']
    .map(key => [key, required(input?.[key])]));
  if (!/^[a-f0-9]{64}$/.test(input?.artifact?.sha256 || '')) throw fail('ETT_MISSION_ARTIFACT_DIGEST_REQUIRED');
  return { ...input, ...scope, artifact: { path: path.resolve(required(input.artifact.path)), sha256: input.artifact.sha256 },
    requirements: requirementsOf(input.requirements), budget: budgetOf(input.budget),
    dimension: input.dimension || 'artifact_structure' };
}
async function assertMissionTenant(db, input, mission) {
  const owner = await db.get(`SELECT w.organization_id,w.project_id FROM agents a
    JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, mission.orchestrator_agent_id);
  if (!owner || owner.organization_id !== input.organizationId || owner.project_id !== input.projectId) {
    throw fail('ETT_MISSION_SCOPE_MISMATCH');
  }
}
function unavailable(owner, options) {
  return !options.historical && (owner.is_apoptotic || ['quarantined', 'terminated', 'error', 'failed'].includes(owner.status));
}
async function assertOwner(db, input, options = {}) {
  const owner = await db.get(`SELECT a.id,a.is_apoptotic,a.status,w.path,w.organization_id,w.project_id
    FROM agents a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, input.agentId);
  if (!owner || owner.organization_id !== input.organizationId || owner.project_id !== input.projectId) {
    throw fail('ETT_MISSION_SCOPE_MISMATCH');
  }
  if (unavailable(owner, options)) throw fail('ETT_MISSION_AGENT_UNAVAILABLE');
  const mission = await db.get('SELECT * FROM missions WHERE mission_id=?', input.missionId);
  if (!mission || (!options.historical && mission.status !== 'active')) throw fail('ETT_MISSION_NOT_ACTIVE');
  if (mission.orchestrator_agent_id !== input.agentId) {
    const member = await db.get('SELECT agent_id FROM mission_agents WHERE mission_id=? AND agent_id=?', input.missionId, input.agentId);
    if (!member) throw fail('ETT_MISSION_MEMBER_REQUIRED');
  }
  await assertMissionTenant(db, input, mission);
  return owner;
}
function snapshot(input, owner) {
  const root = fs.realpathSync(owner.path), file = fs.realpathSync(input.artifact.path);
  const relative = path.relative(root, file);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw fail('ETT_MISSION_ARTIFACT_OUTSIDE_WORKSPACE');
  }
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw fail('ETT_MISSION_ARTIFACT_LIMIT');
  const bytes = fs.readFileSync(file), text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes) || bytesDigest(bytes) !== input.artifact.sha256) throw fail('ETT_MISSION_ARTIFACT_CHANGED');
  return { text, path: file, sha256: bytesDigest(bytes), requirements: input.requirements };
}
function hypothesis(input) {
  return `L’artefact sha256:${input.artifact.sha256} ne satisfait pas les exigences structurelles sha256:${digest(input.requirements)}.`;
}
function question(input, framing) {
  return { text: framing || 'Quelles exigences structurelles de cet artefact sont réfutées par une mesure indépendante ?',
    hypothesis: hypothesis(input),
    method: 'Mesurer mots, scènes et présence de dialogue avec deux programmes fixes isolés sur le même texte et les mêmes exigences.',
    falsifier: 'La mesure indépendante ne trouve aucune exigence structurelle manquante.' };
}

module.exports = { fail, digest, bytesDigest, normalize, assertOwner, snapshot, hypothesis, question };
