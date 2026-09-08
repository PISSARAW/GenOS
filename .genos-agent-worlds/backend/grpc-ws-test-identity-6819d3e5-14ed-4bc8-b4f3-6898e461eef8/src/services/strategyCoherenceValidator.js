/**
 * Strategy Coherence Validator — Ensures that executed strategy matches contracted strategy.
 *
 * Validates:
 * 1. Worker dossiers match the contract's strategy portfolio
 * 2. Strategy transitions maintain coherence of previously collected evidence
 * 3. Strategy contract signatures detect mutations
 */
const crypto = require('crypto');

function hashStrategyContract(contract) {
  if (!contract) return null;
  const canonical = JSON.stringify({
    primary: contract.selected_strategy?.primary,
    portfolio: (contract.strategy_portfolio || []).map((s) => s.id).sort(),
    profile: contract.problem_profile,
    execution_pipeline: contract.execution_pipeline,
    stop_conditions: contract.stop_conditions
  });
  return `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
}

function validateWorkerDossierCoherence(workerDossier, contractPortfolio = []) {
  if (!workerDossier || !workerDossier.events) return { valid: true };
  const portfolioPrimitives = new Set(
    (contractPortfolio || []).flatMap((s) => s.primitives || [])
  );
  const unauthorizedPrimitives = [];
  for (const event of workerDossier.events || []) {
    const executedPrimitive = event.executedPrimitive || event.primitive;
    if (executedPrimitive && !portfolioPrimitives.has(executedPrimitive)) {
      unauthorizedPrimitives.push({ event: event.id, primitive: executedPrimitive });
    }
  }
  if (unauthorizedPrimitives.length > 0) {
    return {
      valid: false,
      reason: `Worker dossier contains events from primitives not in the strategy portfolio: ${unauthorizedPrimitives.map((u) => u.primitive).join(', ')}`,
      unauthorized: unauthorizedPrimitives
    };
  }
  return { valid: true };
}

function validateStrategyTransitionContinuity(previousContract, nextContract) {
  if (!previousContract || !nextContract) return { coherent: true };
  const previousPortfolio = new Set(
    (previousContract.strategy_portfolio || []).map((s) => s.id)
  );
  const nextPortfolio = new Set((nextContract.strategy_portfolio || []).map((s) => s.id));
  const removedStrategies = [...previousPortfolio].filter((id) => !nextPortfolio.has(id));
  if (removedStrategies.length > 0) {
    return {
      coherent: false,
      reason: `Strategy transition removed strategies that may have collected evidence: ${removedStrategies.join(', ')}`,
      removed: removedStrategies
    };
  }
  const previousProfile = JSON.stringify(previousContract.problem_profile || {});
  const nextProfile = JSON.stringify(nextContract.problem_profile || {});
  if (previousProfile !== nextProfile) {
    return {
      coherent: false,
      reason: 'Strategy transition changed the problem profile, invalidating the previous problem assumption',
      previousProfile: previousContract.problem_profile,
      nextProfile: nextContract.problem_profile
    };
  }
  return { coherent: true };
}

function verifyContractIntegrity(contract, expectedHash) {
  if (!contract || !expectedHash) return { verified: true };
  const actualHash = hashStrategyContract(contract);
  if (actualHash !== expectedHash) {
    return {
      verified: false,
      reason: 'Contract has been mutated since it was signed',
      expected: expectedHash,
      actual: actualHash
    };
  }
  return { verified: true };
}

module.exports = {
  hashStrategyContract,
  validateWorkerDossierCoherence,
  validateStrategyTransitionContinuity,
  verifyContractIntegrity
};
