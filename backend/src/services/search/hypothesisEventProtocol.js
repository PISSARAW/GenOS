const { HYPOTHESIS_STATUS } = require('./hypothesisLedgerService');

function proposeFromPayload(ledger, args) {
  const h = ledger.propose({
    id: args.id || undefined,
    agentId: args.agentId,
    statement: args.statement,
    prediction: args.prediction || null,
    falsificationCondition: args.falsification || null,
    confidence: args.confidence ?? 0.5
  });
  ledger.startTest(h.id);
  return h;
}

function applyLifecycle(ledger, type, payload) {
  const id = payload.hypothesisId || null;
  if (!id) return null;
  if (type === 'HYPOTHESIS_TEST_STARTED') return ledger.startTest(id);
  if (type === 'HYPOTHESIS_PROGRESS') return ledger.markProgress(id);
  if (type === 'HYPOTHESIS_FALSIFIED') return ledger.falsify(id);
  if (type === 'HYPOTHESIS_SUSPENDED') return suspend(ledger, id);
  return null;
}

function suspend(ledger, id) {
  const h = ledger.hypotheses.get(id);
  if (!h) return null;
  h.status = HYPOTHESIS_STATUS.SUSPENDED;
  ledger.notify({ type: 'HYPOTHESIS_SUSPENDED', hypothesisId: id });
  return h;
}

function autoGenerate(ledger, args) {
  const gain = Number(args.gain || 0);
  if (!(gain > 0)) return null;
  if (ledger.activeHypotheses().length > 0) return null;
  return proposeFromPayload(ledger, {
    agentId: args.agentId,
    statement: `Hypothèse auto-générée (gain=${gain.toFixed(3)})`,
    confidence: 0.5
  });
}

/**
 * Protocole runtime du Ledger : HYPOTHESIS_PROPOSED, TEST_STARTED,
 * PROGRESS, FALSIFIED, SUSPENDED + proposition via hypothesisStatement
 * + auto-génération sur gain d'information.
 */
function handleHypothesisProtocol(args) {
  const { ledger, eventType, payload, agentId } = args;
  if (eventType === 'HYPOTHESIS_PROPOSED') {
    if (!payload.hypothesisStatement && !payload.statement) return null;
    return proposeFromPayload(ledger, {
      id: payload.hypothesisId,
      agentId,
      statement: payload.hypothesisStatement || payload.statement,
      prediction: payload.hypothesisPrediction,
      falsification: payload.hypothesisFalsification,
      confidence: payload.hypothesisConfidence
    });
  }
  if (['HYPOTHESIS_TEST_STARTED', 'HYPOTHESIS_PROGRESS'].includes(eventType)) {
    return applyLifecycle(ledger, eventType, payload);
  }
  if (['HYPOTHESIS_FALSIFIED', 'HYPOTHESIS_SUSPENDED'].includes(eventType)) {
    return applyLifecycle(ledger, eventType, payload);
  }
  if (payload.hypothesisStatement) {
    return proposeFromPayload(ledger, {
      agentId,
      statement: payload.hypothesisStatement,
      prediction: payload.hypothesisPrediction,
      falsification: payload.hypothesisFalsification,
      confidence: payload.hypothesisConfidence
    });
  }
  return autoGenerate(ledger, { gain: payload.hypothesisInformationGain, agentId });
}

module.exports = { handleHypothesisProtocol };
