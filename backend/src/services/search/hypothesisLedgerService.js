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

const PROVENANCE = {
  OBSERVED: 'observed',
  VERIFIED: 'verified',
  INFERRED: 'inferred',
  SELF_REPORTED: 'self_reported'
}

const PROVENANCE_WEIGHTS = {
  observed: 1.0,
  verified: 1.0,
  inferred: 0.6,
  self_reported: 0.3
}

class HypothesisLedger {
  constructor(options = {}) {
    this.hypotheses = new Map()
    this.proofs = new Map()
    this.listeners = []
    this.budgetRatioThreshold = options.budgetRatioThreshold || 0.8
    this.priorAlpha = options.priorAlpha ?? 1
    this.priorBeta = options.priorBeta ?? 1
  }

  propose(params) {
    const h = {
      id: params.id || crypto.randomBytes(8).toString('hex'),
      agentId: params.agentId,
      parentHypothesisId: params.parentHypothesisId || null,
      branchId: params.branchId || null,
      statement: params.statement || '',
      prediction: params.prediction || null,
      falsificationCondition: params.falsificationCondition || null,
      confidence: params.confidence ?? 0.5,
      uncertainty: 1.0,
      status: HYPOTHESIS_STATUS.PROPOSED,
      createdAt: Date.now(),
      lastTestedAt: null,
      lastProgressAt: null,
      proofIds: []
    }
    this.hypotheses.set(h.id, h)
    this.notify({ type: 'HYPOTHESIS_PROPOSED', hypothesisId: h.id, statement: h.statement })
    return h
  }

  startTest(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    h.lastTestedAt = Date.now()
    if (h.status === HYPOTHESIS_STATUS.PROPOSED) h.status = HYPOTHESIS_STATUS.ACTIVE
    this.notify({ type: 'HYPOTHESIS_TEST_STARTED', hypothesisId: h.id, status: h.status })
    return h
  }

  addEvidence(hypothesisId, proof) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    if (h.status === HYPOTHESIS_STATUS.FALSIFIED) {
      this.notify({ type: 'HYPOTHESIS_REJECTED_EVIDENCE_ON_FALSIFIED', hypothesisId: h.id })
      return h
    }

    const id = proof.id || crypto.randomBytes(6).toString('hex')
    const proofRecord = {
      id,
      hypothesisId,
      direction: proof.direction === 'against' ? 'against' : 'for',
      strength: Math.max(0, Number(proof.strength || 1)),
      provenance: proof.provenance || PROVENANCE.SELF_REPORTED,
      reliability: Math.max(0, Math.min(1, Number(proof.reliability || 0.5))),
      independent: proof.independent !== false,
      evidenceRef: proof.evidenceRef || null,
      receiptRef: proof.receiptRef || null,
      sourceAgent: proof.sourceAgent || null,
      sourceTool: proof.sourceTool || null,
      createdAt: Date.now()
    }
    this.proofs.set(id, proofRecord)
    h.proofIds.push(id)
    h.lastTestedAt = Date.now()

    this.recompute(h)

    if (h.confidence < 0.2 && this.evidenceBalance(h) < -1) {
      h.status = HYPOTHESIS_STATUS.WEAKENED
    } else if (h.confidence > 0.7 && this.evidenceBalance(h) > 1) {
      h.status = HYPOTHESIS_STATUS.SUPPORTED
    }

    this.notify({ type: 'HYPOTHESIS_EVIDENCE_ADDED', hypothesisId: h.id, proofId: id, confidence: h.confidence, status: h.status })
    return h
  }

  recompute(h) {
    const { alpha, beta } = this.summarize(h)
    const totalAlpha = this.priorAlpha + alpha
    const totalBeta = this.priorBeta + beta
    h.confidence = totalAlpha / (totalAlpha + totalBeta)
    h.uncertainty = this.entropy(h.confidence)
  }

  summarize(h) {
    let alpha = 0, beta = 0
    for (const pid of h.proofIds) {
      const p = this.proofs.get(pid)
      if (!p) continue
      const pw = PROVENANCE_WEIGHTS[p.provenance] ?? 0.3
      const effective = p.strength * p.reliability * (p.independent ? 1.0 : 0.7) * pw
      if (p.direction === 'for') alpha += effective
      else beta += effective
    }
    return { alpha, beta }
  }

  evidenceBalance(h) {
    const { alpha, beta } = this.summarize(h)
    return alpha - beta
  }

  entropy(p) {
    if (p <= 0 || p >= 1) return 0
    const log2p = Math.log2(p)
    const log2q = Math.log2(1 - p)
    return Math.min(1, -(p * log2p + (1 - p) * log2q))
  }

  falsify(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    h.status = HYPOTHESIS_STATUS.FALSIFIED
    h.confidence = 0
    h.lastTestedAt = Date.now()
    this.notify({ type: 'HYPOTHESIS_FALSIFIED', hypothesisId: h.id })
    return h
  }

  requestReopen(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h || h.status !== HYPOTHESIS_STATUS.FALSIFIED) return null
    h.status = HYPOTHESIS_STATUS.REOPEN_REQUESTED
    h.confidence = 0.1
    this.notify({ type: 'HYPOTHESIS_REOPEN_REQUESTED', hypothesisId: h.id })
    return h
  }

  reopen(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h || h.status !== HYPOTHESIS_STATUS.REOPEN_REQUESTED) return null
    h.status = HYPOTHESIS_STATUS.ACTIVE
    h.proofIds = []
    h.confidence = 0.3
    h.uncertainty = 1.0
    this.notify({ type: 'HYPOTHESIS_REOPENED', hypothesisId: h.id })
    return h
  }

  markProgress(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    h.lastProgressAt = Date.now()
    return h
  }

  detectLockIn(now = Date.now(), staleMs = 60_000) {
    const results = []
    for (const h of this.hypotheses.values()) {
      if (h.status !== HYPOTHESIS_STATUS.ACTIVE && h.status !== HYPOTHESIS_STATUS.WEAKENED) continue
      const testedRecently = h.lastTestedAt && (now - h.lastTestedAt) < staleMs
      const noRecentProgress = !h.lastProgressAt || (now - h.lastProgressAt) > staleMs * 2
      const dominant = this.isDominant(h)
      if (testedRecently && noRecentProgress && dominant) {
        results.push({
          hypothesisId: h.id, statement: h.statement,
          confidence: h.confidence, lastTestedAt: h.lastTestedAt, lastProgressAt: h.lastProgressAt
        })
      }
    }
    return results
  }

  isDominant(h) {
    return h.confidence > 0.4 && h.proofIds.length >= 3
  }

  activeHypotheses() {
    return Array.from(this.hypotheses.values()).filter(
      h => h.status === HYPOTHESIS_STATUS.ACTIVE || h.status === HYPOTHESIS_STATUS.PROPOSED
    )
  }

  hypothesesForAgent(agentId) {
    return Array.from(this.hypotheses.values()).filter(h => h.agentId === agentId)
  }

  checkFalsifiedBudgetViolation(hypothesisId, budgetRatio) {
    const h = this.hypotheses.get(hypothesisId)
    if (!h) return null
    if (h.status === HYPOTHESIS_STATUS.FALSIFIED && budgetRatio > this.budgetRatioThreshold) {
      return { hypothesisId: h.id, statement: h.statement, budgetRatio, threshold: this.budgetRatioThreshold, violation: true }
    }
    return null
  }

  remove(hypothesisId) { this.hypotheses.delete(hypothesisId) }

  onEvent(listener) { this.listeners.push(listener) }

  notify(event) {
    for (const l of this.listeners) {
      try { l(event) } catch (_) {}
    }
  }
}

module.exports = { HypothesisLedger, HYPOTHESIS_STATUS, PROVENANCE }
