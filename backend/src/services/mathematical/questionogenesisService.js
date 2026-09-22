'use strict';

/**
 * @file questionogenesisService.js
 * @description Questionogenesis — the capacity to generate new mathematical questions.
 * From an anomaly or unexpected invariant, generate a new niche to explore.
 * A question that creates its niche and environment closes the research loop.
 */

const crypto = require('node:crypto');

function questionId() {
  return `q-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

const QUESTION_TEMPLATES = [
  { type: 'universal', template: 'Does every {object} satisfying {condition} necessarily have {property}?', requires: ['object', 'condition', 'property'] },
  { type: 'extremal', template: 'What is the maximal {parameter} for which {property} holds?', requires: ['parameter', 'property'] },
  { type: 'preservation', template: 'Is {phenomenon} preserved under {transformation}?', requires: ['phenomenon', 'transformation'] },
  { type: 'decomposition', template: 'Can {structure} be decomposed into {components}?', requires: ['structure', 'components'] },
  { type: 'classification', template: 'Classify all {objects} with {property}.', requires: ['objects', 'property'] },
  { type: 'existence', template: 'Does there exist an {object} with {property} that also {constraint}?', requires: ['object', 'property', 'constraint'] },
  { type: 'equivalence', template: 'Are {notion1} and {notion2} equivalent for {class}?', requires: ['notion1', 'notion2', 'class'] },
];

class QuestionogenesisEngine {
  constructor(opts = {}) {
    this.id = opts.id || `qogen-${Date.now()}`;
    this.questions = new Map();
    this.anomalyLog = [];
    this.questionValueHistory = [];
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
   * Optionally creates a new niche and environment for the question.
   */
  generateQuestion(anomaly, context = {}) {
    // Select template based on anomaly type
    const template = this.selectTemplate(anomaly, context);
    const filledTemplate = this.fillTemplate(template, anomaly, context);

    const question = {
      id: questionId(),
      text: filledTemplate,
      templateType: template.type,
      source: anomaly.description || 'general observation',
      domain: context.domain || 'general',
      confidence: anomaly.confidence != null ? anomaly.confidence : 0.5,
      state: 'open',
      generatedAt: new Date().toISOString(),
      niche: context.niche || null,
      anomalyId: anomaly.id,
      context: { ...context },
    };

    this.questions.set(question.id, question);

    // Automatically create niche if requested
    if (context.createNiche !== false) {
      question.createdNiche = this.createNicheForQuestion(question, context);
    }

    // Compute question value
    question.value = this.computeQuestionValue(question, context);

    this.questionValueHistory.push({
      questionId: question.id,
      value: question.value,
      timestamp: new Date().toISOString(),
    });

    return question;
  }

  selectTemplate(anomaly, context) {
    // Choose template based on anomaly type and context
    if (anomaly.type === 'unexpected_invariant') {
      return QUESTION_TEMPLATES[Math.floor(Math.random() * QUESTION_TEMPLATES.length)];
    }
    if (anomaly.type === 'fitness_stagnation') {
      return QUESTION_TEMPLATES.find(t => t.type === 'extremal') || QUESTION_TEMPLATES[0];
    }
    if (anomaly.type === 'mvt_departure') {
      return QUESTION_TEMPLATES.find(t => t.type === 'decomposition') || QUESTION_TEMPLATES[0];
    }
    return QUESTION_TEMPLATES[Math.floor(Math.random() * QUESTION_TEMPLATES.length)];
  }

  fillTemplate(template, anomaly, context) {
    const params = {
      object: context.object || 'structure',
      condition: anomaly.description || 'condition P',
      property: context.property || 'property Q',
      parameter: context.parameter || 'size',
      phenomenon: anomaly.description || 'phenomenon X',
      transformation: context.transformation || 'operation T',
      structure: context.structure || 'structure S',
      components: context.components || 'simpler parts',
      objects: context.objects || 'structures',
      notion1: context.notion1 || 'concept A',
      notion2: context.notion2 || 'concept B',
      class: context.class || 'structures',
      constraint: context.constraint || 'additional constraint',
    };

    let text = template.template;
    for (const [key, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return text;
  }

  /**
   * Create a niche and environment for a question.
   * This closes the loop: question -> niche -> environment -> population.
   */
  createNicheForQuestion(question, context = {}) {
    const nicheName = `Question-${question.id}`;
    const niche = {
      id: `niche-${question.id}`,
      name: nicheName,
      kind: 'question-driven',
      formulation: question.text,
      representation: context.representation || 'general',
      questionId: question.id,
      createdAt: new Date().toISOString(),
    };

    // If environment factory provided, create full environment
    if (context.environmentFactory) {
      const env = context.environmentFactory({
        problem: { statement: question.text, domain: question.domain },
        budget: context.budget || { tokens: 5000, cpu: 1800 },
        initialNiches: [niche],
      });
      question.environment = env;
    }

    return niche;
  }

  /**
   * Compute question value: Novelty × Testability × ExpectedInfoGain × FutureAffordances
   */
  computeQuestionValue(question, context) {
    const novelty = context.novelty || (question.confidence * 0.5 + 0.2);
    const testability = context.testability || 0.7; // How easy to formalize/test
    const expectedInfoGain = context.expectedInfoGain || (question.confidence * 0.8);
    const futureAffordances = context.futureAffordances || 0.5; // Potential for new capabilities

    return {
      novelty,
      testability,
      expectedInfoGain,
      futureAffordances,
      total: novelty * testability * expectedInfoGain * futureAffordances,
      computedAt: new Date().toISOString(),
    };
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
      templateType: 'recurring_motif',
      source: 'recurring_motif',
      motifs,
      domain: context.domain || 'general',
      confidence: motifs.length > 2 ? 0.7 : 0.4,
      state: 'open',
      generatedAt: new Date().toISOString(),
    };
    this.questions.set(question.id, question);

    if (context.createNiche !== false) {
      question.createdNiche = this.createNicheForQuestion(question, context);
    }

    question.value = this.computeQuestionValue(question, context);
    return question;
  }

  /**
   * Get questions sorted by value (highest first).
   */
  getQuestionsByValue() {
    return [...this.questions.values()]
      .filter(q => q.value)
      .sort((a, b) => b.value.total - a.value.total);
  }

  summary() {
    return {
      questions: this.questions.size,
      anomalies: this.anomalyLog.length,
      open: [...this.questions.values()].filter(q => q.state === 'open').length,
      avgValue: this.questionValueHistory.length > 0
        ? this.questionValueHistory.reduce((s, q) => s + q.value.total, 0) / this.questionValueHistory.length
        : 0,
    };
  }
}

module.exports = { QuestionogenesisEngine };
