const crypto = require('crypto');

function deterministicUnit(seed) {
  const digest = crypto.createHash('sha256').update(String(seed)).digest();
  return digest.readUInt32BE(0) / 0x100000000;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function contentFingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function validateCognitiveGenes(genes, label = 'genome') {
  if (!genes || typeof genes !== 'object') throw new TypeError(`${label} genes are required.`);
  if (typeof genes.role !== 'string' || !genes.role.trim()) throw new TypeError(`${label}.role must be a non-empty string.`);
  if (typeof genes.strategy !== 'string' || !genes.strategy.trim()) throw new TypeError(`${label}.strategy must be a non-empty string.`);
  if (!Array.isArray(genes.tools) || !genes.tools.length || genes.tools.some((tool) => typeof tool !== 'string' || !tool.trim())) {
    throw new TypeError(`${label}.tools must contain at least one non-empty tool name.`);
  }
  for (const key of ['temp', 'topP']) {
    if (!Number.isFinite(Number(genes[key])) || Number(genes[key]) < 0 || Number(genes[key]) > 1) {
      throw new RangeError(`${label}.${key} must be a finite value in [0, 1].`);
    }
  }
}

// Baseline evolutionary tree so fresh installs still render a meaningful DAG.
const SEED_TREE_NODES = [
  { id: 'node-root', label: 'GenOS Master DAG Root', node_type: 'core', score: 1.0, state_summary: 'Root commit', metadata: { generation: 0, status: 'core' } },
  { id: 'node-arch', label: 'Architecture Node', node_type: 'checkpoint', score: 0.94, state_summary: 'Modular backend', metadata: { generation: 0, status: 'checkpoint' } },
  { id: 'node-worker-genesis', label: 'Worker Genesis', node_type: 'mutation', score: 0.88, state_summary: 'Initial worker lineage', metadata: { generation: 1, status: 'active', mutationType: 'genesis' } }
];
const SEED_TREE_EDGES = [
  { id: 'edge-root-arch', source_node_id: 'node-root', target_node_id: 'node-arch', edge_type: 'lineage' },
  { id: 'edge-root-worker', source_node_id: 'node-root', target_node_id: 'node-worker-genesis', edge_type: 'mutation' }
];

const SEED_DECISIONS = [
  { id: 'decision-seed-guard-clauses', title: 'Guard clauses over nesting', category: 'Heuristics', content: 'Prefer early returns to keep mission prompts flat and auditable.', created_at: null },
  { id: 'decision-seed-checkpoints', title: 'Checkpoint before mutation', category: 'Resilience', content: 'Snapshot workspace state before applying any genome mutation.', created_at: null },
  { id: 'decision-seed-scoped-tools', title: 'Least-privilege tool equip', category: 'Security', content: 'Equip agents with the minimal tool set their strategy requires.', created_at: null }
];

module.exports = {
  deterministicUnit,
  stableValue,
  contentFingerprint,
  validateCognitiveGenes,
  SEED_TREE_NODES,
  SEED_TREE_EDGES,
  SEED_DECISIONS
};
