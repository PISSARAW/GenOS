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

function admittedGenes(mission, stored) {
  if (mission.dnaIncarnation && stored
    && require('./biologicalIntegrity').digest(stored) !== require('./biologicalIntegrity').digest(mission.genome)) {
    throw Object.assign(new Error('Lineage expression conflicts with the admitted DNA genome.'), { code: 'WORKER_GENOME_CONFLICT' });
  }
  return mission.dnaIncarnation ? mission.genome : stored || mission.genome;
}

async function hydrate(db, input) {
  const { mission, agent } = input;
  if (agent.execution_mode !== 'worker' || !expression.usesCognitiveGenome(mission)) return;
  const genes = admittedGenes(mission, await persistedGenes(db, agent));
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
