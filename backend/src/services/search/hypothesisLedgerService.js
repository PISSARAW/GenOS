/**
 * Hypothesis Ledger — Registre d'hypothèses de recherche.
 *
 * Phase 3 : GenOS doit savoir dans quelle idée l'agent est enfermé.
 *
 * Le ledger maintient un ensemble d'hypothèses avec :
 *  - statement / prediction / falsification_condition
 *  - confidence / uncertainty
 *  - evidence_for / evidence_against
 *  - status (proposed / active / weakened / falsified / supported / suspended)
 *
 * Invariant clé : une hypothèse falsifiée ne peut pas continuer à recevoir
 * 80 % du budget sans nouvelle preuve.
 */

const crypto = require('crypto')

const HYPOTHESIS_STATUS = {
  PROPOSED: 'proposed',
  ACTIVE: 'active',
  WEAKENED: 'weakened',
  FALSIFIED: 'falsified',
  SUPPORTED: 'supported',
  SUSPENDED: 'suspended'
}

class Hypothesis {
  constructor(params) {
    this.id = params.id || crypto.randomBytes(8).toString('hex')
    this.agentId = params.agentId
    this.parentHypothesisId = params.parentHypothesisId || null
    this.branchId = params.branchId || null
    this.statement = params.statement || ''
    this.prediction = params.prediction || null
    this.falsificationCondition = params.falsificationCondition || null
    this.confidence = params.confidence ?? 0.5
    this.uncertainty = params.uncertainty ?? 0.5
    this.evidenceFor = params.evidenceFor || 0
    this.evidenceAgainst = params.evidenceAgainst || 0
    this.status = params.status || HYPOTHESIS_STATUS.PROPOSED
    this.createdAt = params.createdAt || Date.now()
    this.lastTestedAt = params.lastTestedAt || null
    this.lastProgressAt = params.lastProgressAt || null
  }
}

class HypothesisLedger {
  constructor(options = {}) {
    this.hypotheses = new Map()
    this.listeners = []
    // seuil : si une hypothèse a > budgetRatioThreshold du budget total
    // et qu'elle est falsifiée, bloquer l'allocation
    this.budgetRatioThreshold = options.budgetRatioThreshold || 0.8
  }

  /**
   * Proposer une nouvelle hypothèse.
   */
  propose(params) {
    const h = new Hypothesis(params)
    this.hypotheses.set(h.id, h)
    this.notify({
      type: 'HYPOTHESIS_PROPOSED',
      hypothesisId: h.id,
      statement: h.statement,
      status: h.status
    })
    return h
  }

  /**
   * Démarrer le test d'une hypothèse.
   */
  startTest(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    h.lastTestedAt = Date.now()
    if (h.status === HYPOTHESIS_STATUS.PROPOSED) {
      h.status = HYPOTHESIS_STATUS.ACTIVE
    }
    this.notify({
      type: 'HYPOTHESIS_TEST_STARTED',
      hypothesisId: h.id,
      status: h.status
    })
    return h
  }

  /**
   * Ajouter une preuve pour ou contre.
   */
  addEvidence(hypothesisId, direction, amount) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    const amt = Math.max(0, Number(amount) || 0)
    if (direction === 'for') {
      h.evidenceFor += amt
      h.confidence = this.recomputeConfidence(h)
      h.uncertainty = Math.max(0, h.uncertainty - amt * 0.1)
    } else if (direction === 'against') {
      h.evidenceAgainst += amt
      h.confidence = this.recomputeConfidence(h)
      h.uncertainty = Math.min(1, h.uncertainty + amt * 0.1)
    }
    h.lastTestedAt = Date.now()

    // Seuils de transition
    if (h.confidence < 0.2 && h.evidenceAgainst > h.evidenceFor * 2) {
      h.status = HYPOTHESIS_STATUS.WEAKENED
    } else if (h.confidence > 0.7 && h.evidenceFor > h.evidenceAgainst * 2) {
      h.status = HYPOTHESIS_STATUS.SUPPORTED
    }

    this.notify({
      type: 'HYPOTHESIS_EVIDENCE_ADDED',
      hypothesisId: h.id,
      direction,
      amount: amt,
      confidence: h.confidence,
      status: h.status
    })
    return h
  }

  /**
   * Falsifier explicitement une hypothèse.
   */
  falsify(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    h.status = HYPOTHESIS_STATUS.FALSIFIED
    h.confidence = 0
    h.lastTestedAt = Date.now()
    this.notify({
      type: 'HYPOTHESIS_FALSIFIED',
      hypothesisId: h.id,
      status: h.status
    })
    return h
  }

  /**
   * Marquer une hypothèse comme affaiblie.
   */
  weaken(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    h.status = HYPOTHESIS_STATUS.WEAKENED
    h.confidence = Math.min(h.confidence, 0.3)
    this.notify({
      type: 'HYPOTHESIS_WEAKENED',
      hypothesisId: h.id,
      status: h.status
    })
    return h
  }

  /**
   * Marquer comme ayant produit du progrès (timestamp).
   */
  markProgress(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    h.lastProgressAt = Date.now()
    return h
  }

  /**
   * Calculer la confiance : ratio de preuves for / total.
   */
  recomputeConfidence(h) {
    const total = h.evidenceFor + h.evidenceAgainst
    if (total === 0) return h.confidence
    return h.evidenceFor / total
  }

  /**
   * Obtenir toutes les hypothèses actives.
   */
  activeHypotheses() {
    return Array.from(this.hypotheses.values()).filter(
      h => h.status === HYPOTHESIS_STATUS.ACTIVE || h.status === HYPOTHESIS_STATUS.PROPOSED
    )
  }

  /**
   * Obtenir toutes les hypothèses filtrées par agent.
   */
  hypothesesForAgent(agentId) {
    return Array.from(this.hypotheses.values()).filter(h => h.agentId === agentId)
  }

  /**
   * Détecter un HYPOTHESIS_LOCK_IN.
   *
   * Lock-in = hypothèse active depuis longtemps,
   * testée récemment, mais sans progrès (lastProgressAt ancien ou jamais).
   * L'agent continue à allouer du budget à une même hypothèse
   * sans gain de preuve.
   */
  detectLockIn(now = Date.now(), staleMs = 60_000) {
    const results = []
    for (const h of this.hypotheses.values()) {
      if (h.status !== HYPOTHESIS_STATUS.ACTIVE && h.status !== HYPOTHESIS_STATUS.WEAKENED) {
        continue
      }
      const testedRecently = h.lastTestedAt && (now - h.lastTestedAt) < staleMs
      const noRecentProgress = !h.lastProgressAt || (now - h.lastProgressAt) > staleMs * 2
      if (testedRecently && noRecentProgress) {
        results.push({
          hypothesisId: h.id,
          statement: h.statement,
          confidence: h.confidence,
          lastTestedAt: h.lastTestedAt,
          lastProgressAt: h.lastProgressAt
        })
      }
    }
    return results
  }

  /**
   * Vérifier qu'une hypothèse falsifiée ne dépasse pas le seuil de budget.
   * Returns l'hypothèse si elle viole le seuil.
   */
  checkFalsifiedBudgetViolation(hypothesisId, budgetRatio) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    if (h.status === HYPOTHESIS_STATUS.FALSIFIED && budgetRatio > this.budgetRatioThreshold) {
      return {
        hypothesisId: h.id,
        statement: h.statement,
        budgetRatio,
        threshold: this.budgetRatioThreshold,
        violation: true
      }
    }
    return null
  }

  /**
   * Supprimer une hypothèse.
   */
  remove(hypothesisId) {
    this.hypotheses.delete(hypothesisId)
  }

  /**
   * S'abouter aux événements du ledger.
   */
  onEvent(listener) {
    this.listeners.push(listener)
  }

  notify(event) {
    for (const l of this.listeners) {
      try { l(event) } catch (_) {}
    }
  }
}

module.exports = {
  Hypothesis,
  HypothesisLedger,
  HYPOTHESIS_STATUS
}
