'use strict';

/**
 * Mondes seedés pour le benchmark écologie de communication.
 *
 * Tout est déterministe (mulberry32) : agents, relations, expertise,
 * common ground, souscriptions récepteurs, intents par scénario.
 */

const rel = require('../../backend/src/services/crossAgentRelationalService');
const tm = require('../../backend/src/services/communication/transactiveMemoryService');
const cg = require('../../backend/src/services/communication/commonGroundService');

function mulberry32(seed) {
  let state = Number(seed) >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRole(next) {
  const roll = next();
  if (roll < 0.05) return 'orchestrator';
  if (roll < 0.15) return 'reviewer';
  return 'worker';
}

function pickTier(next) {
  const roll = next();
  if (roll < 0.7) return 'Flash';
  if (roll < 0.95) return 'Pro';
  return 'frontier';
}

async function createBaseTables(db) {
  await db.exec(`CREATE TABLE agents (id TEXT PRIMARY KEY, role TEXT DEFAULT 'worker', model_tier TEXT DEFAULT 'Flash')`);
  await db.exec(`CREATE TABLE agent_relations (
    id TEXT PRIMARY KEY, source_agent_id TEXT NOT NULL, target_agent_id TEXT NOT NULL,
    relation_type TEXT NOT NULL, relation_class TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
    familiarity REAL NOT NULL DEFAULT 0, interaction_count INTEGER NOT NULL DEFAULT 0,
    shared_history REAL NOT NULL DEFAULT 0, authority REAL NOT NULL DEFAULT 0,
    trust_for_domain REAL NOT NULL DEFAULT 0, common_ground_estimate REAL NOT NULL DEFAULT 0,
    epistemic_independence REAL NOT NULL DEFAULT 1, error_correlation REAL NOT NULL DEFAULT 0,
    disclosure_level REAL NOT NULL DEFAULT 1, preferred_dialect TEXT, last_interaction TEXT,
    organization_id TEXT, project_id TEXT, provenance_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await db.exec(`CREATE TABLE signal_subscriptions (subscriber_agent_id TEXT NOT NULL, topic TEXT NOT NULL, PRIMARY KEY (subscriber_agent_id, topic))`);
  await db.exec(`CREATE TABLE evaluation_runs (id TEXT PRIMARY KEY, benchmark TEXT NOT NULL, score REAL, agent_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
}

async function insertAgents(db, world, next) {
  for (let i = 0; i < world.size; i += 1) {
    const id = `agent-${i}`;
    const role = pickRole(next);
    const tier = pickTier(next);
    const domain = world.domains[i % world.domains.length];
    await db.run('INSERT INTO agents (id, role, model_tier) VALUES (?, ?, ?)', [id, role, tier]);
    world.agents.push({ id, role, tier, domain });
  }
}

async function insertRelations(db, world, next) {
  let n = 0;
  const link = async (edge) => {
    await rel.createRelation({ db, sourceAgentId: edge[0], targetAgentId: edge[1], relationType: edge[2], relationClass: edge[3] });
    n += 1;
  };
  for (let i = 1; i < world.size; i += 1) {
    if (next() < 0.25) await link([`agent-${Math.floor(next() * i)}`, `agent-${i}`, 'parent', 'lineage']);
  }
  const sparse = Math.floor(world.size * 1.5);
  for (let k = 0; k < sparse; k += 1) {
    const a = `agent-${Math.floor(next() * world.size)}`;
    const b = `agent-${Math.floor(next() * world.size)}`;
    if (a === b) continue;
    const roll = next();
    if (roll < 0.5) await link([a, b, 'collaborator', 'collaborative']);
    else if (roll < 0.8) await link([a, b, 'friend', 'social']);
    else if (roll < 0.92) await link([a, b, 'reviewer', 'epistemic']);
    else await link([a, b, 'adversary', 'adversarial']);
  }
  world.relationCount = n;
}

function competenceOf(next) {
  const roll = next();
  if (roll < 0.1) return 0.8 + next() * 0.15;
  if (roll < 0.7) return 0.4 + next() * 0.3;
  return 0.1 + next() * 0.3;
}

async function insertExpertise(db, world, next) {
  for (const agent of world.agents) {
    const competence = competenceOf(next);
    const evidence = 3 + Math.floor(next() * 8);
    await db.run(
      `INSERT INTO agent_expertise (agent_id, domain, competence, calibration, reliability, evidence_count, freshness, capabilities_json, tools_json)
       VALUES (?, ?, ?, 0.5, ?, ?, 0.8, ?, ?)`,
      [agent.id, agent.domain, competence, competence, evidence,
        JSON.stringify([`cap:${agent.domain}`, 'verify']), JSON.stringify(competence > 0.6 ? ['formal-proof'] : [])]
    );
  }
}

async function groundPair(query) {
  const pair = query.a < query.b ? [query.a, query.b] : [query.b, query.a];
  await cg.recordGrounding({
    db: query.db, agentA: pair[0], agentB: pair[1], domain: query.fact.domain,
    semanticFingerprint: query.fact.fp, status: 'grounded', confidence: 0.8
  });
  query.world.groundCount += 1;
}

async function insertGround(db, world, next) {
  world.groundCount = 0;
  const peersOf = peersByDomain(world);
  for (const agent of world.agents) {
    const peers = peersOf.get(agent.domain) || [];
    for (let k = 0; k < 3; k += 1) {
      const peer = peers[Math.floor(next() * peers.length)];
      if (!peer || peer === agent.id) continue;
      const facts = world.facts.filter((fact) => fact.domain === agent.domain);
      for (let f = 0; f < 3; f += 1) {
        await groundPair({ db, world, a: agent.id, b: peer, fact: facts[Math.floor(next() * facts.length)] });
      }
    }
  }
}

function peersByDomain(world) {
  const map = new Map();
  for (const agent of world.agents) {
    const list = map.get(agent.domain) || [];
    list.push(agent.id);
    map.set(agent.domain, list);
  }
  return map;
}

async function insertSubscriptions(db, world) {
  for (const agent of world.agents) {
    await db.run('INSERT OR IGNORE INTO signal_subscriptions (subscriber_agent_id, topic) VALUES (?, ?)', [agent.id, `dom.${agent.domain}.alerts`]);
    await db.run('INSERT OR IGNORE INTO signal_subscriptions (subscriber_agent_id, topic) VALUES (?, ?)', [agent.id, `mission.${world.mission}`]);
  }
}

async function buildWorld(db, config) {
  const next = mulberry32(config.seed);
  const world = {
    size: config.size, domains: config.domains, mission: config.mission || 'm1',
    seed: config.seed, agents: [], facts: [], relationCount: 0, groundCount: 0
  };
  for (const domain of world.domains) {
    for (let k = 0; k < 8; k += 1) world.facts.push({ domain, fp: `sha256:${domain}-fact-${k}` });
  }
  await tm.ensureTables(db);
  await cg.ensureTables(db);
  await createBaseTables(db);
  await insertAgents(db, world, next);
  await insertRelations(db, world, next);
  await insertExpertise(db, world, next);
  await insertGround(db, world, next);
  await insertSubscriptions(db, world);
  return world;
}

const SCENARIO_PURPOSES = ['verify', 'request', 'inform', 'coordinate', 'warn', 'clarify', 'delegate', 'challenge'];

function makeIntents(world, config) {
  const next = mulberry32(config.seed + 999);
  const intents = [];
  for (let i = 0; i < config.intents; i += 1) {
    const sender = world.agents[Math.floor(next() * world.size)];
    const domainFacts = world.facts.filter((f) => f.domain === sender.domain);
    const refs = [0, 1, 2].map(() => domainFacts[Math.floor(next() * domainFacts.length)].fp);
    const purpose = SCENARIO_PURPOSES[Math.floor(next() * SCENARIO_PURPOSES.length)];
    const urgency = next();
    intents.push({
      senderAgentId: sender.id,
      purpose,
      semanticRefs: [...new Set(refs)],
      requiresAction: purpose !== 'inform',
      urgency,
      risk: urgency > 0.85 ? 'high' : urgency > 0.6 ? 'medium' : 'low',
      domain: sender.domain,
      independenceRequired: purpose === 'verify' || purpose === 'challenge'
    });
  }
  return intents;
}

module.exports = { buildWorld, makeIntents, mulberry32 };
