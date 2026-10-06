'use strict';

const { withTransaction } = require('../../../db');
const risk = require('./riskLedgerService');
const artifacts = require('./runtimeArtifacts');

const TOPOLOGIES = Object.freeze(['trinity', 'a_team', 'biome', 'metapopulation', 'holobionte', 'biocenose', 'syncytium', 'rhizome', 'morphogenesis']);

function topology(value) {
  if (!TOPOLOGIES.includes(value)) throw new Error('RISK_TOPOLOGY_UNSUPPORTED');
  return value;
}

async function createScope(db, input) {
  if (!input.scopeId || !input.nodeId) throw new Error('RISK_SCOPE_OWNER_REQUIRED');
  topology(input.topology);
  return withTransaction(db, async (tx) => {
    const existing = await tx.get('SELECT root_id FROM morph_risk_scopes WHERE scope_id = ?', [input.scopeId]);
    if (existing) throw new Error('RISK_SCOPE_CANNOT_RESET');
    const rootId = input.grantId || `risk:${input.scopeId}`;
    await risk.createRoot(tx, { grantId: rootId, ownerNodeId: input.nodeId, scope: { scopeId: input.scopeId }, units: input.units });
    await tx.run('INSERT INTO morph_risk_scopes (scope_id, root_id) VALUES (?, ?)', [input.scopeId, rootId]);
    await tx.run(`INSERT INTO morph_risk_nodes (node_id, scope_id, topology, grants_json, state)
      VALUES (?, ?, ?, ?, 'ACTIVE')`, [input.nodeId, input.scopeId, input.topology, JSON.stringify([rootId])]);
    return { scopeId: input.scopeId, nodeId: input.nodeId, grantIds: [rootId] };
  });
}

async function node(db, nodeId) {
  if (!db || typeof db.get !== 'function') return null;
  const schema = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'morph_risk_nodes'");
  if (!schema) return null;
  const value = await db.get('SELECT * FROM morph_risk_nodes WHERE node_id = ?', [nodeId]);
  return value ? { ...value, grantIds: JSON.parse(value.grants_json) } : null;
}

async function activeNode(db, nodeId) {
  const value = await node(db, nodeId);
  if (!value || value.state !== 'ACTIVE') throw new Error('ACTIVE_RISK_OWNER_REQUIRED');
  for (const id of value.grantIds) {
    const grant = await db.get('SELECT owner_node_id FROM morph_risk_grants WHERE grant_id = ?', [id]);
    if (grant?.owner_node_id !== nodeId) throw new Error('RISK_OWNER_SUPERSEDED');
  }
  return value;
}

async function fork(db, input) {
  return withTransaction(db, async (tx) => {
    const parent = await activeNode(tx, input.nodeId);
    requireScope(parent, input);
    if (!parent.grantIds.includes(input.parentGrantId)) throw new Error('RISK_GRANT_OWNER_MISMATCH');
    for (const child of input.children) topology(child.topology);
    await risk.splitGrant(tx, { parentId: input.parentGrantId, children: input.children.map((child) => ({ ...child, ownerNodeId: child.nodeId })) });
    for (const child of input.children) {
      await tx.run(`INSERT INTO morph_risk_nodes (node_id, scope_id, topology, grants_json, state)
        VALUES (?, ?, ?, ?, 'ACTIVE')`, [child.nodeId, parent.scope_id, child.topology, JSON.stringify([child.grantId])]);
    }
    return { scopeId: parent.scope_id, children: input.children.map((child) => child.nodeId) };
  });
}

async function merge(db, input) {
  topology(input.topology);
  return withTransaction(db, async (tx) => {
    const parents = [];
    for (const id of new Set(input.nodeIds)) parents.push(await activeNode(tx, id));
    if (!parents.length || new Set(parents.map((item) => item.scope_id)).size !== 1) throw new Error('RISK_SCOPE_MISMATCH');
    requireScope(parents[0], input);
    const grantIds = parents.flatMap((item) => item.grantIds);
    await risk.mergeOwnership(tx, { grantIds, newOwnerNodeId: input.newNodeId });
    for (const parent of parents) await tx.run("UPDATE morph_risk_nodes SET state = 'MERGED', revision = revision + 1 WHERE node_id = ?", [parent.node_id]);
    await tx.run(`INSERT INTO morph_risk_nodes (node_id, scope_id, topology, grants_json, state)
      VALUES (?, ?, ?, ?, 'ACTIVE')`, [input.newNodeId, parents[0].scope_id, input.topology, JSON.stringify(grantIds)]);
    return { scopeId: parents[0].scope_id, nodeId: input.newNodeId, grantIds };
  });
}

async function lifecycle(db, input) {
  if (!['ARCHIVED', 'ACTIVE', 'TRANSITION'].includes(input.action)) throw new Error('RISK_LIFECYCLE_ACTION_INVALID');
  return withTransaction(db, async (tx) => {
    const owner = await node(tx, input.nodeId);
    if (!owner || owner.state === 'MERGED' || owner.revision !== input.revision) throw new Error('RISK_LIFECYCLE_CONFLICT');
    requireScope(owner, input);
    const nextTopology = input.topology ? topology(input.topology) : owner.topology;
    const state = input.action === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
    await tx.run('UPDATE morph_risk_nodes SET topology = ?, state = ?, revision = revision + 1 WHERE node_id = ?',
      [nextTopology, state, input.nodeId]);
    const artifactRef = await artifacts.put(tx, { scopeId: owner.scope_id, kind: 'risk-lifecycle',
      content: { nodeId: input.nodeId, grantIds: owner.grantIds, state, topology: nextTopology, revision: owner.revision + 1 } });
    return { nodeId: input.nodeId, state, revision: owner.revision + 1, artifactRef };
  });
}

async function reserveNext(db, input) {
  return withTransaction(db, async (tx) => {
    const owner = await activeNode(tx, input.nodeId);
    requireScope(owner, input);
    if (!owner.grantIds.includes(input.grantId)) throw new Error('RISK_GRANT_OWNER_MISMATCH');
    const grant = await tx.get('SELECT initial_units FROM morph_risk_grants WHERE grant_id = ?', [input.grantId]);
    const count = await tx.get('SELECT COUNT(*) AS n FROM morph_risk_tests WHERE grant_id = ?', [input.grantId]);
    const previous = await tx.get('SELECT * FROM morph_risk_tests WHERE test_id = ?', [input.testId]);
    const ratio = await allocationRatio(tx, { ...input, scopeId: owner.scope_id });
    if (previous) return risk.reserveTest(tx, { ...input, units: previous.alpha_units });
    const units = Math.floor(grant.initial_units * (1 - ratio) * ratio ** count.n);
    if (units < 1) throw new Error('RISK_PRECISION_EXHAUSTED');
    return risk.reserveTest(tx, { ...input, units });
  });
}

async function promotion(db, input) {
  const owner = await node(db, input.nodeId);
  if (!owner) return { allowed: true, applied: false };
  try {
    await activeNode(db, input.nodeId);
    requireScope(owner, input);
    if (!input.contract) throw new Error('INHERITED_STATISTICAL_CONTRACT_REQUIRED');
    const test = await db.get('SELECT grant_id FROM morph_risk_tests WHERE test_id = ?', [input.contract.testId]);
    if (!test || !owner.grantIds.includes(test.grant_id)) throw new Error('STATISTICAL_PROMOTION_OWNER_MISMATCH');
    const result = await risk.finalizeTest(db, { ...input.contract, scopeId: owner.scope_id });
    return { allowed: result.eligible, applied: true, result, reason: result.eligible ? null : 'STATISTICAL_THRESHOLD_NOT_MET' };
  } catch (error) { return { allowed: false, applied: true, reason: error.message }; }
}

module.exports = { createScope, fork, merge, lifecycle, reserveNext, promotion, node, TOPOLOGIES };

function requireScope(owner, input) {
  if (input.scopeId && owner.scope_id !== input.scopeId) throw new Error('RISK_SCOPE_MISMATCH');
}

async function allocationRatio(db, input) {
  const prior = await db.get('SELECT ratio FROM morph_risk_allocators WHERE grant_id = ?', [input.grantId]);
  if (prior) {
    if (input.ratio !== undefined && input.ratio !== prior.ratio) throw new Error('RISK_ALLOCATION_POLICY_CONFLICT');
    return prior.ratio;
  }
  const ratio = input.ratio ?? (Math.sqrt(5) - 1) / 2;
  if (!(ratio > 0 && ratio < 1)) throw new Error('SUMMABLE_ALLOCATION_REQUIRED');
  const artifactRef = await artifacts.put(db, { scopeId: input.scopeId, kind: 'risk-allocation-policy',
    content: { grantId: input.grantId, ratio } });
  await db.run('INSERT INTO morph_risk_allocators (grant_id, ratio, artifact_ref) VALUES (?, ?, ?)', [input.grantId, ratio, artifactRef]);
  return ratio;
}
