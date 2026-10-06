'use strict';

const { randomUUID } = require('node:crypto');
const LEASE_MS = 5 * 60 * 1000;

function identity(context) {
  return [context.orchestratorId, context.sourceEventId, context.decision.tool];
}

function storedContext(context) {
  return JSON.stringify({
    orchestratorId: context.orchestratorId, sourceAgentId: context.sourceAgentId,
    decision: context.decision, event: context.event, workspaceRoot: context.workspaceRoot
  });
}

async function claim(context) {
  if (!context.sourceEventId || !context.decision.tool) return false;
  const fields = identity(context);
  const token = randomUUID();
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - LEASE_MS).toISOString();
  const key = fields.join(':');
  const inserted = await context.db.run(
    `INSERT OR IGNORE INTO orchestration_action_receipts
       (receipt_key, orchestrator_id, source_event_id, tool, status, created_at, claim_token, context_json, attempts)
     VALUES (?, ?, ?, ?, 'started', ?, ?, ?, 1)`,
    key, ...fields, now, token, storedContext(context)
  );
  if (inserted.changes === 1) {
    context.claimToken = token;
    return false;
  }
  const renewed = await context.db.run(
    `UPDATE orchestration_action_receipts
       SET status = 'started', completed_at = NULL, created_at = ?, claim_token = ?,
           context_json = ?, result_json = NULL, attempts = attempts + 1
     WHERE receipt_key = ? AND orchestrator_id = ? AND source_event_id = ? AND tool = ?
       AND ((status = 'failed' AND completed_at IS NULL)
         OR (status = 'started' AND julianday(created_at) <= julianday(?)))`,
    now, token, storedContext(context), key, ...fields, cutoff
  );
  if (renewed.changes !== 1) return true;
  context.claimToken = token;
  return false;
}

async function finish(context, outcome) {
  if (!context.claimToken) return true;
  const result = await context.db.run(
    `UPDATE orchestration_action_receipts SET status = ?, result_json = ?,
       completed_at = CASE WHEN ? THEN NULL ELSE CURRENT_TIMESTAMP END
     WHERE orchestrator_id = ? AND source_event_id = ? AND tool = ?
       AND claim_token = ? AND status = 'started'`,
    outcome.status, JSON.stringify(outcome.result || {}), outcome.deferred === true,
    ...identity(context), context.claimToken
  );
  return result.changes === 1;
}

async function renew(context) {
  if (!context.claimToken) return true;
  const result = await context.db.run(
    `UPDATE orchestration_action_receipts SET created_at = ?
     WHERE orchestrator_id = ? AND source_event_id = ? AND tool = ?
       AND claim_token = ? AND status = 'started'`,
    new Date().toISOString(), ...identity(context), context.claimToken
  );
  return result.changes === 1;
}

function heartbeat(context) {
  if (!context.claimToken) return () => {};
  let pending = Promise.resolve();
  const timer = setInterval(() => {
    pending = pending.then(async () => {
      const owned = await renew(context);
      if (!owned) context.leaseLost = true;
    }).catch((error) => { context.leaseError = error.message; });
  }, LEASE_MS / 3);
  timer.unref();
  return async () => { clearInterval(timer); await pending; };
}

module.exports = { claim, finish, renew, heartbeat, LEASE_MS };
