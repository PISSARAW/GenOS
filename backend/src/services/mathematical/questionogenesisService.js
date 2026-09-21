'use strict';

/**
 * @file questionogenesisService.js
 * @description Questionogenesis — the capacity to generate new mathematical questions.
 * From an anomaly or unexpected invariant, generate a new niche to explore.
 */

const crypto = require('node:crypto');

function questionId() {
  return `q-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

class QuestionogenesisEngine {
  constructor(opts = {}) {
    this.id = opts.id || `qogen-${Date.now()}`;
    this.questions = new Map();
    this.anomalyLog = [];
  }

  /**
   * Observe an anomaly in the current research.
   * anomaly = { type, description, source, confidence }
   */
  observeAnomaly(anomaly) {
    const entry = {
      id: `anom-${Date.now()}`,
      type: anomaly.type || 'unexpected_invariant',
      description: anomaly.description || '',
      source: anomaly.source || null,
      confidence: anomaly.confidence != null ? anomaly.confidence : 0.5,
      observedAt: new Date().toISOString(),
    };
    this.anomalyLog.push(entry);
    return entry;
  }

  /**
   * From an anomaly, generate a new mathematical question.
   */
  generateQuestion(anomaly, context = {}) {
    const templates = [
      `Does every ${context.object || 'structure'} satisfying ${anomaly.description || 'condition P'} necessarily have ${context.property || 'property Q'}?`,
      `What is the maximal ${context.parameter || 'size'} for which ${anomaly.description || 'property P'} holds?`,
      `Is ${anomaly.description || 'phenomenon X'} preserved under ${context.transformation || 'operation T'}?`,
      `Can ${anomaly.description || 'structure S'} be decomposed into ${context.components || 'simpler parts'}?`,
    ];

    const question = {
      id: questionId(),
      text: templates[Math.floor(Math.random() * templates.length)],
      source: anomaly.description || 'general observation',
      domain: context.domain || 'general',
      confidence: anomaly.confidence != null ? anomaly.confidence : 0.5,
      state: 'open',
      generatedAt: new Date().toISOString(),
      niche: context.niche || null,
    };

    this.questions.set(question.id, question);
    return question;
  }

  /**
   * From a recurring motif across multiple observations, generate a deeper question.
   */
  fromRecurringMotif(motifs, context = {}) {
    if (!motifs || motifs.length === 0) return null;
    const motif = motifs[Math.floor(Math.random() * motifs.length)];
    const question = {
      id: questionId(),
      text: `Is the recurring motif "${motif}" always present when ${context.condition || 'condition C'} holds?`,
      source: 'recurring_motif',
      motifs,
      domain: context.domain || 'general',
      confidence: motifs.length > 2 ? 0.7 : 0.4,
      state: 'open',
      generatedAt: new Date().toISOString(),
    };
    this.questions.set(question.id, question);
    return question;
  }

  summary() {
    return {
      questions: this.questions.size,
      anomalies: this.anomalyLog.length,
      open: [...this.questions.values()].filter(q => q.state === 'open').length,
    };
  }
}

module.exports = { QuestionogenesisEngine };
