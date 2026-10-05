const { SearchReceipt } = require('./SearchReceipt');

async function plasticity(context, searchGenome, db) {
  const receipt = new SearchReceipt('PLASTICITE', 'PHENOTYPE_CHANGED');
  if (!db || !context.agentId) return receipt.setSkipped('No agent storage available');
  try {
    const agent = await db.get('SELECT id FROM agents WHERE id=?', context.agentId);
    if (!agent) return receipt.setSkipped('Agent not found');
    const current = searchGenome.genome;
    const before = { topology: current.topology, tools: [...current.operators] };
    const topologies = ['isolated', 'adversarial', 'swarm', 'pipeline'];
    const topology = topologies.find(t => t !== current.topology);
    searchGenome.genome.topology = topology;
    return receipt.setSuccess({ before,
      after: { topology, tools: [...current.operators] }, changed: true, scope: 'search-genome' });
  } catch (err) { return receipt.setFailure(err.message); }
}

async function speciation(context, searchGenome, db) {
  const receipt = new SearchReceipt('SPECIATION', 'NICHES_CREATED');
  if (!db || !context.agentId) return receipt.setSkipped('No agent storage available');
  try {
    const focuses = ['temporal', 'state', 'environment'];
    const niches = focuses.map((focus, index) => ({ id: `niche_${context.agentId}_${index}`, focus }));
    const params = niches.flatMap(n => [n.id, context.agentId, n.focus, Date.now()]);
    const result = await db.run(`INSERT INTO search_niches(id,agent_id,focus,created_at)
      VALUES (?,?,?,?),(?,?,?,?),(?,?,?,?) ON CONFLICT(id) DO NOTHING`, params);
    return receipt.setSuccess({ nichesCreated: result.changes, niches });
  } catch (err) { return receipt.setFailure(err.message); }
}

module.exports = { plasticity, speciation };
