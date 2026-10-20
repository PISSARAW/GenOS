'use strict';

const fs = require('fs');
const { withTransaction } = require('../../db');
const { migrateAsyncDelegation } = require('../../db/migrations/migrateAsyncDelegation');
const { getProject } = require('./projectStore');
const { getResponsibility } = require('../shev/responsibilityService');
const { assertCandidate } = require('./worktreeService');
const { canonicalJson, digest } = require('./durableJson');

const ensuredDatabases = new WeakSet();

async function ensureTables(db) {
  if (ensuredDatabases.has(db)) return;
  await migrateAsyncDelegation(db);
  ensuredDatabases.add(db);
}

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}-requis`);
  return value.trim();
}

function acceptanceOf(mandate) {
  return mandate.dimensions.map((dimension) => ({
    dimension: dimension.name,
    expected: dimension.expected,
    criteria: [...dimension.acceptance]
  }));
}

function planFrom(responsibility) {
  const acceptance = acceptanceOf(responsibility.mandate);
  return {
    version: 1,
    source: {
      kind: 'shev_responsibility',
      mandateVersion: responsibility.mandateVersion,
      authorityRef: responsibility.authorityRef,
      purpose: responsibility.mandate.purpose
    },
    steps: [
      { id: 'scope', checkpoint: true, acceptance },
      { id: 'execute_isolated', checkpoint: true, acceptance },
      { id: 'independent_verify', checkpoint: true, acceptance },
      { id: 'post_integration_effect', checkpoint: true, acceptance }
    ]
  };
}

function isolatedCapsule(project, capsulePath) {
  const resolved = assertCandidate(project, required(capsulePath, 'capsule'));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error('capsule-isolee-introuvable');
  }
  return resolved;
}

async function delegationContext(db, input) {
  const project = await getProject(db, required(input?.projectId, 'projet'));
  if (!project) throw new Error('projet-introuvable');
  const responsibility = await getResponsibility(db, project.id);
  if (!responsibility || responsibility.status !== 'active') throw new Error('responsabilite-shev-inactive');
  if (responsibility.stage !== 'delegated') throw new Error('responsabilite-shev-non-deleguee');
  return { project, responsibility, capsulePath: isolatedCapsule(project, input.capsulePath) };
}

function missionIntent(input, context) {
  const plan = planFrom(context.responsibility);
  return {
    missionId: required(input.missionId, 'mission'),
    projectId: context.project.id,
    producerId: required(input.producerId, 'producteur'),
    capsulePath: context.capsulePath,
    baseRevision: required(input.baseRevision, 'revision-base'),
    mandateVersion: context.responsibility.mandateVersion,
    authorityRef: context.responsibility.authorityRef,
    plan,
    planHash: digest(plan)
  };
}

async function insertMission(db, intent) {
  const existing = await db.get('SELECT * FROM ontogenesis_delegations WHERE id = ?', [intent.missionId]);
  if (existing) {
    if (existing.plan_hash !== intent.planHash) throw new Error('mission-deleguee-idempotence-conflit');
    return existing;
  }
  await db.run(`INSERT INTO ontogenesis_delegations
    (id, project_id, mandate_version, authority_ref, producer_id, capsule_path,
     base_revision, plan_json, plan_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [intent.missionId, intent.projectId, intent.mandateVersion, intent.authorityRef,
    intent.producerId, intent.capsulePath, intent.baseRevision,
    canonicalJson(intent.plan), intent.planHash]);
  return db.get('SELECT * FROM ontogenesis_delegations WHERE id = ?', [intent.missionId]);
}

async function deriveDelegation(db, input) {
  await ensureTables(db);
  const context = await delegationContext(db, input);
  const intent = missionIntent(input, context);
  const row = await withTransaction(db, () => insertMission(db, intent));
  return { ...row, plan: JSON.parse(row.plan_json) };
}

module.exports = { deriveDelegation, planFrom, ensureTables };
