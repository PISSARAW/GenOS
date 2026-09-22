'use strict';

/**
 * @file testGenetics.js
 * @description Genetics & Genome tests
 */

async function runGeneticsTests(options = {}) {
  const { request, assert, token, smokeTenantHeaders } = options;
  console.log('\n--- 8. Genetics & Genome: Phylogeny & Crossover Synthesizer ---');
  const phyloRes = await request({ method: 'GET', path: '/api/genome/phylogeny' });
  assert(phyloRes.status === 200 && phyloRes.body.nodes.length >= 3, 'GET /api/genome/phylogeny returned evolutionary mutation DAG');

  const allelesRes = await request({ method: 'GET', path: '/api/genome/alleles' });
  assert(allelesRes.status === 200 && allelesRes.body.unclassifiedAlleles.length > 0 && allelesRes.body.dominantBeneficialGenes.length === 0, 'GET /api/genome/alleles refuses unsupported beneficial classifications');

  const crossRes = await request({
    method: 'POST',
    path: '/api/genome/crossover',
    headers: { Authorization: `Bearer ${token}`, ...smokeTenantHeaders }
  }, {
    parentA: { name: 'API Parent A', genes: { role: 'worker', strategy: 'tree-search', tools: ['genos_inspect'], temp: 0.4, topP: 0.9 } },
    parentB: { name: 'API Parent B', genes: { role: 'reviewer', strategy: 'evidence', tools: ['genos_test'], temp: 0.5, topP: 0.9 } },
    options: { strategy: 'uniform', mutationRate: 0.05 }
  });
  assert(crossRes.status === 200 && crossRes.body.childGenes !== undefined && crossRes.body.predictedFitnessScore > 0, 'POST /api/genome/crossover synthesized valid child agent DNA');
}

module.exports = { runGeneticsTests };