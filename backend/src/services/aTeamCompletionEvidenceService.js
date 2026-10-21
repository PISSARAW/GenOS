'use strict';

function distinctIds(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}

function validCompletion(state) {
  const completion = state?.execution?.integration?.completion;
  if (!completion) return false;
  const required = completion?.requiredMemberIds || [];
  const completed = new Set(completion?.completedMemberIds || []);
  const checks = completion?.closureChecks || {};
  return [state?.status === 'COMPLETED', state.execution.integration.accepted === true,
    completion.schema === 'genos.mission-completion/v1', completion.verdict === 'succeeded',
    completion.success === true, required.length > 0, required.every((id) => completed.has(id)),
    checks.requiredWorkers === true, checks.invariants === true,
    checks.independentOracle === true, checks.evidence === true].every(Boolean);
}

async function latest(db, missionIds = []) {
  if (!db) return null;
  const ids = distinctIds(missionIds);
  if (!ids.length) return null;
  const placeholders = ids.map(() => '?').join(',');
  let rows;
  try {
    rows = await db.all(`SELECT id, state_json FROM topology_sessions
      WHERE topology = 'a_team' AND json_extract(state_json, '$.missionId') IN (${placeholders})
      ORDER BY updated_at DESC`, ...ids);
  } catch (error) {
    if (/no such table/i.test(error.message)) return null;
    throw error;
  }
  for (const row of rows) {
    let state;
    try { state = JSON.parse(row.state_json); } catch (_) { continue; }
    if (validCompletion(state)) return { teamRunId: row.id, state,
      completion: state.execution.integration.completion };
  }
  return null;
}

module.exports = { latest, validCompletion };
