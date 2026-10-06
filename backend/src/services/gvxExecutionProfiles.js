'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hash, error, sameScope } = require('./gvxContracts');
const { digest } = require('./gvxVerifierRegistry');
const policies = require('./agow/agowMechanismPolicyService');

function loadProfiles() {
  const file = process.env.GENOS_GVX_EXECUTION_PROFILES_FILE;
  if (!file) return [];
  const bytes = fs.readFileSync(path.resolve(file));
  if (digest(bytes) !== process.env.GENOS_GVX_EXECUTION_PROFILES_SHA256) throw error('GVX_EXECUTION_PROFILES_HASH_MISMATCH');
  const profiles = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(profiles) || new Set(profiles.map((item) => item.id)).size !== profiles.length) {
    throw error('GVX_EXECUTION_PROFILES_INVALID');
  }
  return profiles.map(validateProfile);
}

function validateProfile(profile) {
  if (profile.schema !== 'genos.gvx.execution-profile/v1' || !/^[a-z0-9._-]{1,100}$/.test(profile.id || '')
      || !sameScope(profile.scope, profile.scope) || !profile.agentId) throw error('GVX_EXECUTION_PROFILE_INVALID');
  require('./gvxExecutionIsolation').executionIdentity(profile);
  if (!profile.runtimeDatabaseFile || !path.isAbsolute(profile.runtimeDatabaseFile)) throw error('GVX_RUNTIME_DATABASE_REQUIRED');
  validateControls(profile);
  validateConditions(profile);
  const cwd = fs.realpathSync(profile.cwd);
  const normalized = { ...profile, cwd, parentPolicy: { ...policies.DEFAULT_POLICY, ...profile.parentPolicy },
    candidatePolicy: { ...policies.DEFAULT_POLICY, ...profile.candidatePolicy } };
  if (hash(normalized.parentPolicy) === hash(normalized.candidatePolicy)) throw error('GVX_EXECUTION_NO_POLICY_CHANGE');
  verifySources(normalized);
  return { ...normalized, profileHash: hash(normalized), parentHash: hash(normalized.parentPolicy),
    candidateHash: hash(normalized.candidatePolicy) };
}

function validateControls(profile) {
  const valid = profile.parentPolicy && profile.candidatePolicy
    && policies.validPolicy(profile.parentPolicy) && policies.validPolicy(profile.candidatePolicy)
    && Array.isArray(profile.metrics) && profile.metrics.length >= 2 && profile.metrics.includes('safety')
    && Array.isArray(profile.sources) && profile.sources.length > 0;
  if (!valid) throw error('GVX_EXECUTION_CONTROLS_INVALID');
  validatePredictions(profile);
  validateBudget(profile);
  validateMetrics(profile);
  validateAuthority(profile);
}

function validatePredictions(profile) {
  if (!profile.pathwayId || !profile.predictedMetrics
      || !profile.metrics.every((name) => Number.isFinite(profile.predictedMetrics[name]))) {
    throw error('GVX_EXECUTION_DECLARED_PREDICTIONS_REQUIRED');
  }
}

function validateBudget(profile) {
  if (!profile.model || !Number.isInteger(profile.maxSeconds) || profile.maxSeconds < 1 || profile.maxSeconds > 3600
      || !Number.isFinite(profile.maxCost) || profile.maxCost <= 0) throw error('GVX_EXECUTION_BUDGET_INVALID');
}

function validateMetrics(profile) {
  const assessment = profile.assessmentProfile;
  if (!require('./gvxBuiltinVerifiers').conservativeSomaticProfile(assessment)
      || !Number.isInteger(assessment.minSamples) || assessment.minSamples > 1000
      || !assessment.rules.every((rule) => profile.metrics.includes(rule.metric))) {
    throw error('GVX_EXECUTION_ASSESSMENT_PROFILE_REQUIRED');
  }
  if (new Set(profile.metrics).size !== profile.metrics.length
      || !profile.metrics.every((name) => /^[a-z][a-z0-9_]{0,63}$/.test(name))
      || new Set(assessment.rules.map((rule) => rule.metric)).size !== assessment.rules.length) {
    throw error('GVX_EXECUTION_METRICS_INVALID');
  }
}

function validateConditions(profile) {
  const conditions = profile.conditions;
  if (!conditions?.baseline || !conditions?.candidate || !Array.isArray(profile.monitorConditions)
      || profile.monitorConditions.length < 3) throw error('GVX_EXECUTION_CONDITIONS_INVALID');
  const selected = ['baseline', 'candidate', ...profile.monitorConditions];
  for (const id of selected) {
    const condition = conditions[id];
    if (!validCondition(condition)) throw error('GVX_EXECUTION_COMMAND_INVALID');
  }
  const contexts = new Set(profile.monitorConditions.map((id) => conditions[id].contextHash));
  if (contexts.size !== profile.monitorConditions.length || contexts.has(undefined)) throw error('GVX_MONITOR_CONTEXTS_INVALID');
  validatePairedConditions(profile);
}

function validatePairedConditions(profile) {
  const { baseline, candidate } = profile.conditions;
  if (baseline.command !== candidate.command || baseline.suiteHash !== candidate.suiteHash
      || baseline.contextHash !== candidate.contextHash) throw error('GVX_PAIRED_CONTROLS_MISMATCH');
  if (new Set(profile.monitorConditions).size !== profile.monitorConditions.length
      || profile.monitorConditions.some((id) => ['baseline', 'candidate'].includes(id))) {
    throw error('GVX_MONITOR_CONDITIONS_INVALID');
  }
  const hashes = profile.monitorConditions.map((id) => profile.conditions[id].contextHash);
  if (!hashes.every((value) => /^[a-f0-9]{64}$/.test(value))) throw error('GVX_MONITOR_CONTEXTS_INVALID');
}

function verifySources(profile) {
  for (const source of profile.sources) {
    if (typeof source.path !== 'string' || path.isAbsolute(source.path)) throw error('GVX_EXECUTION_RELATIVE_SOURCE_REQUIRED');
    const resolved = fs.realpathSync(path.resolve(profile.cwd, source.path));
    const relative = path.relative(profile.cwd, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw error('GVX_EXECUTION_SOURCE_ESCAPE');
    if (digest(fs.readFileSync(resolved)) !== source.hash) throw error('GVX_EXECUTION_SOURCE_HASH_MISMATCH');
  }
}

function publicProfile(profile) {
  return { id: profile.id, profileHash: profile.profileHash, scope: profile.scope, agentId: profile.agentId,
    parentHash: profile.parentHash, candidateHash: profile.candidateHash, parentPolicy: profile.parentPolicy,
    candidatePolicy: profile.candidatePolicy, model: profile.model, maxSeconds: profile.maxSeconds,
    maxCost: profile.maxCost, metrics: profile.metrics, assessmentProfile: profile.assessmentProfile,
    predictedMetrics: profile.predictedMetrics, pathwayId: profile.pathwayId,
    monitorConditions: profile.monitorConditions,
    conditions: Object.fromEntries(Object.entries(profile.conditions).map(([id, item]) =>
      [id, { suiteHash: item.suiteHash, contextHash: item.contextHash || hash(item.suiteHash) }])),
    controls: { model: profile.model, toolsetHash: hash(profile.sources), environmentHash: profile.profileHash } };
}

module.exports = { loadProfiles, validateProfile, verifySources, publicProfile };

function validCondition(condition) { return Boolean(condition && require('./sandboxCommandPolicy').isAllowedSandboxTestCommand(condition.command) && /^[a-f0-9]{64}$/.test(condition.suiteHash || '')); }

function validateAuthority(profile) {
  const actions=profile.allowedActions||[];
  if(!Array.isArray(actions)||!actions.every(action=>['gvx.somatic.apply','gvx.somatic.rollback'].includes(action))) {
    throw error('GVX_EXECUTION_AUTHORITY_INVALID');
  }
  if(actions.includes('gvx.somatic.apply')&&!actions.includes('gvx.somatic.rollback')) throw error('GVX_ROLLBACK_PREAUTHORIZATION_REQUIRED');
}
