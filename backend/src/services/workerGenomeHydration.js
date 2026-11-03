'use strict';

const expression = require('./workerGenomeExpression');

async function persistedGenes(db, agent) {
  const row = await db.get('SELECT metadata, workspace_id FROM lineage_nodes WHERE id = ?', agent.id);
  if (!row) return null;
  if (row.workspace_id !== agent.workspace_id) {
    throw Object.assign(new Error('Worker lineage is outside its authorized workspace.'), { code: 'WORKER_GENOME_SCOPE_MISMATCH' });
  }
  try {
    const metadata = JSON.parse(row.metadata || '{}');
    return Object.hasOwn(metadata, 'genes') ? expression.express(metadata.genes) : null;
  }
  catch (cause) {
    throw Object.assign(new Error('Persisted worker genome is malformed.'), { code: 'INVALID_WORKER_GENOME', cause });
  }
}

async function hydrate(db, input) {
  const { mission, agent } = input;
  if (agent.execution_mode !== 'worker' || !expression.usesCognitiveGenome(mission)) return;
  const stored = await persistedGenes(db, agent);
  const genes = stored || mission.genome;
  if (!genes) return;
  if (!Array.isArray(mission.toolLease)) {
    mission.toolLease = require('./toolLeasePolicy').derivePolicyLease({ executionMode: 'worker',
      role: mission.role || agent.role, capabilities: mission.capabilities || [] });
  }
  expression.apply(mission, genes);
  if (mission.hostExecutionContext) {
    mission.hostExecutionContext = require('./hostExecutionContext').bindHostToolLease(mission.hostExecutionContext, mission.toolLease);
  }
}

module.exports = { hydrate, persistedGenes };
