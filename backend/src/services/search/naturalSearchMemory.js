function isEvolutionSelection(selection) {
  return ['EVOLUTION', 'CLONAL_AFFINITY_SEARCH'].includes(selection.process);
}

function transmitEvolvedPlasmid(context) {
  const { searchState, selection, receipt, searchCtx, agentId } = context;
  if (!isEvolutionSelection(selection) || !receipt.result) return;
  const genome = searchState.actuator.modules.getBestGenome?.();
  if (!genome) return;
  const plasmid = searchState.actuator.modules.compilePlasmid(genome, {
    environment: { searchYield: searchCtx.searchYield || 0, falsifiedHypotheses: searchCtx.falsifiedHypotheses || 0 },
    generations: receipt.result.evolutionLog?.length || 0,
    successRate: 0.7,
    reproducible: true
  });
  if (plasmid) searchState.actuator.modules.cultureService.transmit(plasmid.id, agentId);
}

function recordFalsifiedHypotheses(context) {
  const { searchState, agentId, eventType } = context;
  const hypotheses = searchState.ledger.hypothesesForAgent(agentId).filter(h => h.status === 'falsified');
  for (const hypothesis of hypotheses) {
    try {
      searchState.actuator.modules.recordNegativeOutcome(agentId, hypothesis,
        { ref: `falsified:${hypothesis.id}`, strength: 0.8, reliability: 0.9 },
        { signature: eventType, conditions: [], scope: 'agent' });
    } catch (_) {}
  }
}

function handlePostReceiptMemory(context) {
  if (context.receipt?.status !== 'success') return;
  try { transmitEvolvedPlasmid(context); } catch (_) {}
  recordFalsifiedHypotheses(context);
}

module.exports = { handlePostReceiptMemory };
