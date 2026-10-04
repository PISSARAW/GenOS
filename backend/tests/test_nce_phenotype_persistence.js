'use strict';

const assert = require('node:assert/strict');
const { applyPhenotype } = require('../src/services/nceEngines');

async function main() {
  const rows = new Map();
  const db = {
    async run(_sql, id, agentId, genomeId, stateJson) {
      rows.set(id, { agentId, genomeId, stateJson });
    },
    async get(_sql, agentId) {
      const row = [...rows.values()].find((item) => item.agentId === agentId);
      return row ? { state_json: row.stateJson } : null;
    },
  };
  const mission = {
    agentId: 'phenotype-e2e-agent',
    genomeId: 'genome-e2e-agent',
    requiredTools: ['grid_solver'],
    requiredCapabilities: ['planning'],
  };
  const config = { phenotype: { enabled: true } };
  const first = await applyPhenotype(mission, config, db);
  assert.equal(first.branchCount, 2);
  assert.ok(first.stateId);
  const second = await applyPhenotype({ ...mission, requiredTools: [], requiredCapabilities: ['reasoning'] }, config, db);
  assert.equal(second.branchCount, 3, 'second call loads and extends persisted phenotype state');
  assert.equal(rows.size, 1, 'agent phenotype is updated in place');
  console.log('Phenotype runtime persistence: PASS');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
