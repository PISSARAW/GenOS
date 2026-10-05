function transmitEvolvedPlasmid(context) {
  const { searchState, searchCtx, agentId } = context;
  const outcome = searchCtx.validatedSearchOutcomes;
  if (!outcome || !outcome.targetAgentId || outcome.targetAgentId === agentId) return;
  const modules = searchState.actuator.modules;
  const genome = modules.getBestGenome();
  const validation = outcome.cultureValidation;
  if (!validation || validation.genomeId !== genome?.id) return;
  const refs = observedReferences(searchState.ledger, genome.hypothesisFamily);
  if (!Array.isArray(validation.evidenceRefs) || !validation.evidenceRefs.every(ref => refs.has(ref))) return;
  const plasmid = modules.compilePlasmid(genome, validation);
  if (plasmid) modules.cultureService.transmit(plasmid.id, outcome.targetAgentId);
}

function observedReferences(ledger, family) {
  const supported = [...ledger.hypotheses.values()].filter(h => h.status === 'supported' && h.statement.includes(family));
  const proofs = supported.flatMap(h => ledger.proofsByIds(h.proofIds));
  return new Set(proofs.filter(p => p.direction === 'for' && ['observed', 'verified'].includes(p.provenance)).map(p => p.evidenceRef));
}

function recordFalsifiedHypotheses(context) {
  const { searchState, agentId, eventType, hypothesisId } = context;
  const modules = searchState.actuator.modules;
  modules.negativeMemory.evaporate();
  if (eventType !== 'HYPOTHESIS_FALSIFIED') return;
  for (const h of searchState.ledger.hypothesesForAgent(agentId)) {
    if (h.id !== hypothesisId || h.status !== 'falsified') continue;
    modules.recordNegativeOutcome(agentId, h,
      { ref: `falsified:${h.id}`, strength: 0.8, reliability: 0.9 },
      { signature: 'falsified', conditions: [], scope: 'agent' });
  }
}

function handlePostReceiptMemory(context) {
  recordFalsifiedHypotheses(context);
  if (context.receipt?.status !== 'success') return;
  if (!['EVOLUTION', 'CLONAL_AFFINITY_SEARCH'].includes(context.selection.process)) return;
  transmitEvolvedPlasmid(context);
}

module.exports = { handlePostReceiptMemory };
