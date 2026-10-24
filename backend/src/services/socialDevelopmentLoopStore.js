'use strict';

const { createHash, randomUUID } = require('node:crypto');
const preparedDbs = new WeakSet();

function keyOf(input) {
  return createHash('sha256').update([
    input.scope.organizationId, input.scope.projectId, input.agentId, input.observationId
  ].join('\0')).digest('hex');
}

function leaseExpiry(input) {
  const leaseMs = Number.isSafeInteger(input.leaseMs) ? Math.max(1000, input.leaseMs) : 600000;
  return new Date(Date.now() + leaseMs).toISOString();
}

function parseResult(value) {
  try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
}

async function claim(db, input) {
  if (!preparedDbs.has(db)) {
    await require('../db/migrations/migrateSocialDevelopmentLoop').migrateSocialDevelopmentLoop(db);
    preparedDbs.add(db);
  }
  const key = keyOf(input);
  const token = randomUUID();
  await db.run(`INSERT INTO social_development_observations
    (observation_key, organization_id, project_id, agent_id, observation_id,
     status, claim_token, lease_expires_at)
    VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)
    ON CONFLICT(observation_key) DO UPDATE SET status = 'processing', claim_token = excluded.claim_token,
      lease_expires_at = excluded.lease_expires_at, updated_at = CURRENT_TIMESTAMP
    WHERE status != 'completed' AND julianday(lease_expires_at) <= julianday('now')`,
  key, input.scope.organizationId, input.scope.projectId, input.agentId,
  input.observationId, token, leaseExpiry(input));
  const row = await db.get(`SELECT status, claim_token AS claimToken, lease_expires_at AS leaseExpiresAt,
    result_json AS resultJson FROM social_development_observations WHERE observation_key = ?`, [key]);
  if (row.status === 'completed') return { status: 'observation-already-processed', result: parseResult(row.resultJson) };
  if (row.claimToken !== token) return { status: 'social-observation-in-progress', leaseExpiresAt: row.leaseExpiresAt };
  return { status: 'claimed', claimToken: token };
}

async function complete(db, input) {
  const result = await db.run(`UPDATE social_development_observations
    SET status = 'completed', result_json = ?, lease_expires_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE observation_key = ? AND claim_token = ? AND status = 'processing'`,
  JSON.stringify(input.result), new Date(0).toISOString(), keyOf(input), input.claimToken);
  if (result.changes !== 1) throw new Error('social-loop-claim-lost-before-completion');
}

async function fail(db, input) {
  await db.run(`UPDATE social_development_observations
    SET status = 'inconclusive', lease_expires_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE observation_key = ? AND claim_token = ? AND status = 'processing'`,
  new Date(0).toISOString(), keyOf(input), input.claimToken);
}

module.exports = { claim, complete, fail, keyOf };
