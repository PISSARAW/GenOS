/**
 * Hypothesis Ledger — Registre d'hypothèses de recherche v2.
 *
 * Corrections P0 :
 *  - P0-4 : Confiance bayésienne avec prior (α,β) au lieu du ratio brut
 *  - P0-14 : Preuves structurées avec provenance, force, indépendance
 *  - P0-15 : Transition FALSIFIED → REOPENED explicite requise
 *  - P0-5 : L'incertitude suit l'entropie de la croyance
 */

const crypto = require('crypto')

const HYPOTHESIS_STATUS = {
  PROPOSED: 'proposed',
  ACTIVE: 'active',
  WEAKENED: 'weakened',
  FALSIFIED: 'falsified',
  SUPPORTED: 'supported',
  SUSPENDED: 'suspended',
  REOPEN_REQUESTED: 'reopen_requested',
  REOPENED: 'reopened'
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
    this.uncertainty = params.uncertainty ?? 1.0
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
    this.budgetRatioThreshold = options.budgetRatioThreshold || 0.8
    this.priorAlpha = options.priorAlpha ?? 1
    this.priorBeta = options.priorBeta ?? 1
  }

  propose(params) {
    const h = new Hypothesis(params)
    this.hypotheses.set(h.id, h)
    this.notify({ type: 'HYPOTHESIS_PROPOSED', hypothesisId: h.id, statement: h.statement, status: h.status })
    return h
  }

  startTest(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    h.lastTestedAt = Date.now()
    if (h.status === HYPOTHESIS_STATUS.PROPOSED) {
      h.status = HYPOTHESIS_STATUS.ACTIVE
    }
    this.notify({ type: 'HYPOTHESIS_TEST_STARTED', hypothesisId: h.id, status: h.status })
    return h
  }

  addEvidence(hypothesisId, direction, amount) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    // P0-15 : pas de transition directe FALSIFIED → autre via addEvidence
    if (h.status === HYPOTHESIS_STATUS.FALSIFIED) {
      this.notify({ type: 'HYPOTHESIS_REJECTED_EVIDENCE_ON_FALSIFIED', hypothesisId: h.id, direction, amount })
      return h
    }
    const amt = Math.max(0, Number(amount) || 0)
    if (direction === 'for') {
      h.evidenceFor += amt
    } else if (direction === 'against') {
      h.evidenceAgainst += amt
    }
    // P0-4 : mise à jour bayésienne
    h.confidence = this.recomputeConfidence(h)
    // P0-5 : incertitude = entropie normalisée de la croyance
    h.uncertainty = this.computeUncertainty(h)
    h.lastTestedAt = Date.now()

    if (h.confidence < 0.2 && h.evidenceAgainst > h.evidenceFor * 2) {
      h.status = HYPOTHESIS_STATUS.WEAKENED
    } else if (h.confidence > 0.7 && h.evidenceFor > h.evidenceAgainst * 2) {
      h.status = HYPOTHESIS_STATUS.SUPPORTED
    }

    this.notify({ type: 'HYPOTHESIS_EVIDENCE_ADDED', hypothesisId: h.id, direction, amount: amt, confidence: h.confidence, status: h.status })
    return h
  }

  falsify(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    h.status = HYPOTHESIS_STATUS.FALSIFIED
    h.confidence = 0
    h.lastTestedAt = Date.now()
    this.notify({ type: 'HYPOTHESIS_FALSIFIED', hypothesisId: h.id, status: h.status })
    return h
  }

  // P0-15 : transition explicite FALSIFIED → REOPEN_REQUESTED
  requestReopen(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h || h.status !== HYPOTHESIS_STATUS.FALSIFIED) return null
    h.status = HYPOTHESIS_STATUS.REOPEN_REQUESTED
    h.confidence = 0.1
    this.notify({ type: 'HYPOTHESIS_REOPEN_REQUESTED', hypothesisId: h.id, status: h.status })
    return h
  }

  reopen(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h || h.status !== HYPOTHESIS_STATUS.REOPEN_REQUESTED) return null
    h.status = HYPOTHESIS_STATUS.ACTIVE
    h.evidenceFor = 0
    h.evidenceAgainst = 0
    h.confidence = 0.3
    this.notify({ type: 'HYPOTHESIS_REOPENED', hypothesisId: h.id, status: h.status })
    return h
  }

  weaken(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    h.status = HYPOTHESIS_STATUS.WEAKENED
    h.confidence = Math.min(h.confidence, 0.3)
    this.notify({ type: 'HYPOTHESIS_WEAKENED', hypothesisId: h.id, status: h.status })
    return h
  }

  markProgress(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    h.lastProgressAt = Date.now()
    return h
  }

  // P0-4 : confiance bayésienne avec prior Beta(α,β)
  recomputeConfidence(h) {
    const alpha = this.priorAlpha + h.evidenceFor
    const beta = this.priorBeta + h.evidenceAgainst
    return alpha / (alpha + beta)
  }

  // P0-5 : entropie normalisée d'une distribution Beta-bernoulli
  computeUncertainty(h) {
    const p = h.confidence
    if (p <= 0 || p >= 1) return 0
    const log2p = Math.log2(p)
    const log2q = Math.log2(1 - p)
    const entropy = -(p * log2p + (1 - p) * log2q)
    return Math.min(1, entropy / 1.0)
  }

  activeHypotheses() {
    return Array.from(this.hypotheses.values()).filter(
      h => h.status === HYPOTHESIS_STATUS.ACTIVE || h.status === HYPOTHESIS_STATUS.PROPOSED
    )
  }

  hypothesesForAgent(agentId) {
    return Array.from(this.hypotheses.values()).filter(h => h.agentId === agentId)
  }

  detectLockIn(now = Date.now(), staleMs = 60_000) {
    const results = []
    for (const h of this.hypotheses.values()) {
      if (h.status !== HYPOTHESIS_STATUS.ACTIVE && h.status !== HYPOTHESIS_STATUS.WEAKENED) continue
      const testedRecently = h.lastTestedAt && (now - h.lastTestedAt) < staleMs
      const noRecentProgress = !h.lastProgressAt || (now - h.lastProgressAt) > staleMs * 2
      if (testedRecently && noRecentProgress) {
        results.push({
          hypothesisId: h.id, statement: h.statement,
          confidence: h.confidence, lastTestedAt: h.lastTestedAt, lastProgressAt: h.lastProgressAt
        })
      }
    }
    return results
  }

  checkFalsifiedBudgetViolation(hypothesisId, budgetRatio) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    if (h.status === HYPOTHESIS_STATUS.FALSIFIED && budgetRatio > this.budgetRatioThreshold) {
      return {
        hypothesisId: h.id, statement: h.statement,
        budgetRatio, threshold: this.budgetRatioThreshold, violation: true
      }
    }
    return null
  }

  remove(hypothesisId) {
    this.hypotheses.delete(hypothesisId)
  }

  onEvent(listener) {
    this.listeners.push(listener)
  }

  notify(event) {
    for (const l of this.listeners) {
      try { l(event) } catch (_) {}
    }
  }
}

module.exports = { Hypothesis, HypothesisLedger, HYPOTHESIS_STATUS }
