'use strict';

const crypto = require('node:crypto');
const { encode } = require('./biologicalIntegrity');
const { migrateRustKernelMissionPlans } = require('../db/migrations/migrateRustKernelMissionPlans');

const SCHEMA = 'genos.rust-control-kernel-plan/v1';

async function persist(db, input) {
  const envelope = input.envelope;
  if (!envelope) return null;
  validateEnvelope(envelope, input);
  await migrateRustKernelMissionPlans(db);
  const planJson = envelope.planJson;
  await db.run(`INSERT OR IGNORE INTO rust_kernel_mission_plans
    (mission_id, schema, objective_hash, plan_hash, plan_json)
    VALUES (?, ?, ?, ?, ?)`, input.missionId, SCHEMA, envelope.objectiveHash,
  envelope.planHash, planJson);
  const stored = await db.get('SELECT * FROM rust_kernel_mission_plans WHERE mission_id = ?',
    input.missionId);
  assertStored(stored, envelope, planJson);
  return stored;
}

function validateEnvelope(envelope, input) {
  if (envelope.schema !== SCHEMA || envelope.missionId !== input.missionId) {
    throw invalid('RUST_KERNEL_PLAN_BINDING_MISMATCH');
  }
  if (typeof envelope.planJson !== 'string' || sha256(envelope.planJson) !== envelope.planHash) {
    throw invalid('RUST_KERNEL_PLAN_HASH_MISMATCH');
  }
  const parsed = parsePlan(envelope.planJson);
  if (!envelope.plan || encode(parsed) !== encode(envelope.plan)) {
    throw invalid('RUST_KERNEL_PLAN_BINDING_MISMATCH');
  }
  if (sha256(input.objective) !== envelope.objectiveHash) {
    throw invalid('RUST_KERNEL_OBJECTIVE_HASH_MISMATCH');
  }
}

function parsePlan(planJson) {
  try { return JSON.parse(planJson); }
  catch (_) { throw invalid('RUST_KERNEL_PLAN_JSON_INVALID'); }
}

function assertStored(stored, envelope, planJson) {
  if (!stored || stored.schema !== SCHEMA || stored.objective_hash !== envelope.objectiveHash
    || stored.plan_hash !== envelope.planHash || stored.plan_json !== planJson) {
    throw invalid('RUST_KERNEL_PLAN_CONFLICT');
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function invalid(code) {
  return Object.assign(new Error(code), { code });
}

module.exports = { persist, SCHEMA };
