'use strict';

/**
 * @file mathematicalOrganismQuestion.js
 * @description Question generation phase for MathematicalOrganismRuntime
 */

function question(runtime, observations) {
  const questions = [];

  for (const anomaly of observations.anomalies) {
    runtime.questionogenesis.observeAnomaly(anomaly);
    const q = runtime.questionogenesis.generateQuestion(anomaly, {
      domain: runtime.environment.problem.domain,
      object: 'structure',
      property: 'property',
      parameter: 'size',
      transformation: 'operation',
      components: 'simpler parts',
      niche: anomaly.niche,
    });
    questions.push(q);
    runtime.metrics.totalQuestions++;
  }

  const motifs = runtime.extractMotifs(observations.stigmergicTraces);
  if (motifs.length > 0) {
    const q = runtime.questionogenesis.fromRecurringMotif(motifs, {
      domain: runtime.environment.problem.domain,
      condition: 'current research state',
    });
    if (q) {
      questions.push(q);
      runtime.metrics.totalQuestions++;
    }
  }

  for (const q of questions) {
    materializeQuestionNiche(runtime, q);
  }

  return questions;
}

/**
 * materializeQuestionNiche — installe réellement la niche d'une question
 * dans l'écosystème : Concept → Question → Niche → Population.
 *
 * Voie commune utilisée par M8 (question) et M7 (conceptogenesis) : si
 * generateQuestion() a produit un descriptor `createdNiche`, il est
 * matérialisé via environment.createNiche + nicheService.addNiche et
 * l'id réel est rattaché à la question. Retourne la niche créée ou null.
 */
function materializeQuestionNiche(runtime, q) {
  if (!q || (!q.createdNiche && !q.niche)) return null;
  if (!q.createdNiche && runtime.nicheService.niches.has(q.niche)) return null;
  const descriptor = q.createdNiche || {};
  const niche = runtime.environment.createNiche({
    name: descriptor.name || `Question-${q.id}`,
    representation: descriptor.representation || 'general',
    formulation: q.text,
  });
  runtime.nicheService.addNiche(niche);
  q.niche = niche.id;
  return niche;
}

module.exports = { question, materializeQuestionNiche };