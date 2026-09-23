'use strict';

/**
 * Instantané monde en mémoire pour vérifications exactes.
 *
 * Le harness connaît l'état réel (ground, expertise, relations) : la
 * redondance, la contamination et le succès sont MESURÉS sur l'état,
 * jamais estimés. Les tokens LLM restent hors de portée sans modèle :
 * on compte bytes exacts + unités de coût du modèle calibré.
 */

function pairId(agentA, agentB) {
  if (agentA < agentB) return `${agentA}|${agentB}`;
  return `${agentB}|${agentA}`;
}

async function snapshotWorld(db, world) {
  const groundRows = await db.all("SELECT agent_a, agent_b, semantic_fingerprint FROM communication_common_ground WHERE status = 'grounded'");
  const expertiseRows = await db.all('SELECT agent_id, domain, competence FROM agent_expertise');
  const relationRows = await db.all('SELECT source_agent_id, target_agent_id, epistemic_independence, error_correlation FROM agent_relations');
  const subRows = await db.all('SELECT subscriber_agent_id, topic FROM signal_subscriptions');
  return {
    world,
    ground: groundSetOf(groundRows),
    expertise: expertiseMapOf(expertiseRows),
    relations: relationRows,
    subs: subsMapOf(subRows),
    byDomain: domainMapOf(world.agents)
  };
}

function groundSetOf(rows) {
  const set = new Set();
  for (const row of rows) {
    set.add(`${pairId(row.agent_a, row.agent_b)}|${row.semantic_fingerprint}`);
  }
  return set;
}

function expertiseMapOf(rows) {
  const map = new Map();
  for (const row of rows) {
    map.set(`${row.agent_id}|${row.domain}`, Number(row.competence));
  }
  return map;
}

function subsMapOf(rows) {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.topic) || [];
    list.push(row.subscriber_agent_id);
    map.set(row.topic, list);
  }
  return map;
}

function domainMapOf(agents) {
  const map = new Map();
  for (const agent of agents) {
    const list = map.get(agent.domain) || [];
    list.push(agent.id);
    map.set(agent.domain, list);
  }
  return map;
}

function knownAll(query) {
  for (const ref of query.refs) {
    const key = `${pairId(query.agentA, query.agentB)}|${ref}`;
    if (!query.snap.ground.has(key)) return false;
  }
  return true;
}

function competenceOf(snap, agentId, domain) {
  const known = snap.expertise.get(`${agentId}|${domain}`);
  if (known === undefined) return 0;
  return known;
}

function correlatedWith(snap, agentId, threshold) {
  const circle = new Set();
  for (const row of snap.relations) {
    if (Number(row.epistemic_independence) >= threshold) continue;
    if (row.source_agent_id === agentId) circle.add(row.target_agent_id);
    if (row.target_agent_id === agentId) circle.add(row.source_agent_id);
  }
  return circle;
}

function capableIn(query) {
  const capable = [];
  for (const id of query.candidates) {
    if (id !== query.senderId && competenceOf(query.snap, id, query.domain) >= 0.7) capable.push(id);
  }
  return capable;
}

module.exports = { snapshotWorld, knownAll, competenceOf, correlatedWith, capableIn };
