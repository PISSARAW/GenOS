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
    if (q.createdNiche) {
      const niche = runtime.environment.createNiche({
        name: `Question-${q.id}`,
        representation: 'general',
        formulation: q.text,
      });
      runtime.nicheService.addNiche(niche);
      q.niche = niche.id;
    } else if (q.niche && !runtime.nicheService.niches.has(q.niche)) {
      const niche = runtime.environment.createNiche({
        name: `Question-${q.id}`,
        representation: 'general',
        formulation: q.text,
      });
      runtime.nicheService.addNiche(niche);
      q.niche = niche.id;
    }
  }

  return questions;
}

module.exports = { question };