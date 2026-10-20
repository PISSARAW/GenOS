'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const migration = require('../db/migrations/migrateTrajectoryStewardships');

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw coded('TRAJECTORY_STEWARDSHIP_STORE_INVALID', `${field} must be a non-empty string.`);
  }
  return value.trim();
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function normalize(input) {
  const decision = input?.decision;
  if (!decision?.goal || decision.mode === 'NO_CHANGE' || decision.goal.mode !== decision.mode) {
    throw coded('TRAJECTORY_STEWARDSHIP_NO_ACTION', 'Only an authorized actionable goal can become a responsibility.');
  }
  const createdAt = required(input.createdAt, 'createdAt');
  if (Number.isNaN(Date.parse(createdAt))) {
    throw coded('TRAJECTORY_STEWARDSHIP_STORE_INVALID', 'createdAt must be an ISO date.');
  }
  return {
    organizationId: required(input.organizationId, 'organizationId'),
    projectId: required(input.projectId, 'projectId'),
    decision,
    createdAt: new Date(createdAt).toISOString()
  };
}

function seal(input) {
  const goal = input.decision.goal;
  if (goal.projectId !== input.projectId) {
    throw coded('TRAJECTORY_STEWARDSHIP_SCOPE_MISMATCH', 'Goal and persistence project scopes differ.');
  }
  const decisionHash = digest(input.decision);
  const responsibilityId = `responsibility_${digest([input.organizationId, input.projectId,
    goal.goalId]).slice(0, 24)}`;
  const body = {
    schemaVersion: 1,
    responsibilityId,
    goalId: goal.goalId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    agentId: goal.ownerAgentId,
    mandateRef: goal.mandateRef,
    objectiveRef: goal.objectiveRef,
    observationRef: goal.observationRef,
    mode: goal.mode,
    domains: [...goal.domains],
    decisionHash,
    createdAt: input.createdAt
  };
  return { ...body, receiptId: `stewardship_${digest(body).slice(0, 24)}` };
}

function parse(row) {
  let receipt;
  try { receipt = JSON.parse(row.receipt_json); } catch (_) {
    throw coded('TRAJECTORY_STEWARDSHIP_INTEGRITY_FAILED', 'Stored responsibility is not valid JSON.');
  }
  if (row.content_hash !== digest(receipt) || row.receipt_id !== receipt.receiptId) {
    throw coded('TRAJECTORY_STEWARDSHIP_INTEGRITY_FAILED', 'Stored responsibility integrity failed.');
  }
  return receipt;
}

async function existing(db, input) {
  return db.get(`SELECT * FROM trajectory_stewardship_responsibilities
    WHERE organization_id=? AND project_id=? AND goal_id=?`,
  input.organizationId, input.projectId, input.decision.goal.goalId);
}

async function persist(db, receipt) {
  await db.run(`INSERT INTO trajectory_stewardship_responsibilities
    (organization_id, project_id, responsibility_id, goal_id, agent_id, mandate_ref,
     objective_ref, observation_ref, mode, domains_json, decision_hash, receipt_id,
     content_hash, receipt_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  receipt.organizationId, receipt.projectId, receipt.responsibilityId, receipt.goalId,
  receipt.agentId, receipt.mandateRef, receipt.objectiveRef, receipt.observationRef,
  receipt.mode, canonicalJson(receipt.domains), receipt.decisionHash, receipt.receiptId,
  digest(receipt), canonicalJson(receipt), receipt.createdAt);
}

async function openResponsibility(db, rawInput) {
  await migration.migrateTrajectoryStewardships(db);
  const input = normalize(rawInput);
  const receipt = seal(input);
  const replay = await existing(db, input);
  if (replay) {
    const stored = parse(replay);
    if (stored.decisionHash !== receipt.decisionHash || stored.createdAt !== receipt.createdAt) {
      throw coded('TRAJECTORY_STEWARDSHIP_IDEMPOTENCY_CONFLICT', 'Goal id was reused with divergent input.');
    }
    return { receipt: stored, replayed: true };
  }
  await persist(db, receipt);
  return { receipt, replayed: false };
}

async function getResponsibility(db, input) {
  await migration.migrateTrajectoryStewardships(db);
  const row = await db.get(`SELECT * FROM trajectory_stewardship_responsibilities
    WHERE organization_id=? AND project_id=? AND responsibility_id=?`,
  required(input?.organizationId, 'organizationId'), required(input?.projectId, 'projectId'),
  required(input?.responsibilityId, 'responsibilityId'));
  if (!row) throw coded('TRAJECTORY_STEWARDSHIP_NOT_FOUND', 'Scoped responsibility was not found.');
  return parse(row);
}

async function listResponsibilities(db, input) {
  await migration.migrateTrajectoryStewardships(db);
  const rows = await db.all(`SELECT * FROM trajectory_stewardship_responsibilities
    WHERE organization_id=? AND project_id=? ORDER BY created_at, responsibility_id`,
  required(input?.organizationId, 'organizationId'), required(input?.projectId, 'projectId'));
  return rows.map(parse);
}

module.exports = { openResponsibility, getResponsibility, listResponsibilities };
