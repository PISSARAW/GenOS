'use strict';

const { getDatabase } = require('../../db');

const VISIBLE_KINDS = new Set(['problem', 'evidence']);

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

async function relationRows(db, agentIds) {
  if (agentIds.length === 0) return [];
  const marks = agentIds.map(() => '?').join(',');
  return db.all(
    `SELECT source_agent_id AS s, target_agent_id AS t, epistemic_independence AS ei
     FROM agent_relations WHERE source_agent_id IN (${marks}) OR target_agent_id IN (${marks})`,
    [...agentIds, ...agentIds]
  );
}

function minIndependence(agentId, rows, fromIds) {
  let floor = 1;
  for (const row of rows) {
    const involves = (row.s === agentId && fromIds.indexOf(row.t) >= 0)
      || (row.t === agentId && fromIds.indexOf(row.s) >= 0);
    if (involves && Number(row.ei) < floor) floor = Number(row.ei);
  }
  return floor;
}

async function assessIndependence(input) {
  const db = await resolveDb(input.db);
  const fromIds = input.fromIds || [];
  const rows = await relationRows(db, [input.agentId, ...fromIds]);
  const perSource = fromIds.map((id) => ({ agentId: id, independence: minIndependence(input.agentId, rows, [id]) }));
  const floor = perSource.reduce((acc, entry) => (entry.independence < acc ? entry.independence : acc), 1);
  const threshold = input.threshold === undefined ? 0.5 : Number(input.threshold);
  return { agentId: input.agentId, minIndependence: floor, perSource, threshold, independent: floor >= threshold };
}

function sourceIds(sources) {
  return (sources || []).map((source) => source.agentId);
}

async function epistemicFirewall(input) {
  const db = await resolveDb(input.db);
  const assessed = await assessIndependence({
    db, agentId: input.reviewerId, fromIds: sourceIds(input.sources), threshold: input.threshold
  });
  const visible = [];
  const redacted = [];
  for (const source of input.sources || []) {
    if (VISIBLE_KINDS.has(source.kind)) visible.push(source);
    else redacted.push(source);
  }
  return {
    reviewerId: input.reviewerId, visible, redacted,
    minIndependence: assessed.minIndependence, independent: assessed.independent,
    policy: 'hide-conclusions'
  };
}

function firewallOf(intent) {
  if (!intent.independenceRequired) return null;
  return {
    blindedFrom: [intent.senderAgentId],
    policy: 'hide-conclusions',
    visibleKinds: ['problem', 'evidence']
  };
}

module.exports = { assessIndependence, epistemicFirewall, firewallOf };
