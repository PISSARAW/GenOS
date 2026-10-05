const { SearchReceipt } = require('./SearchReceipt');

async function plasticity(context, searchGenome, db) {
  const receipt = new SearchReceipt('PLASTICITE', 'PHENOTYPE_CHANGED');
  if (!db || !context.agentId) return receipt.setSkipped('No agent storage available');
  try {
    const current = await db.get('SELECT topology,tools FROM agents WHERE id=?', context.agentId);
    if (!current) return receipt.setSkipped('Agent not found');
    const topologies = ['isolated', 'adversarial', 'swarm', 'pipeline'];
    const topology = topologies.find(t => t !== current.topology);
    const tools = searchGenome.genome.operators;
    const result = await db.run('UPDATE agents SET topology=?, tools=? WHERE id=?',
      [topology, JSON.stringify(tools), context.agentId]);
    if (result.changes === 0) return receipt.setSkipped('Agent not found');
    searchGenome.genome.topology = topology;
    return receipt.setSuccess({ before: { topology: current.topology, tools: current.tools },
      after: { topology, tools }, changed: true });
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
