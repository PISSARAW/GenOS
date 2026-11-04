'use strict';

const { fail } = require('./qualityContract');
const { validatedCall } = require('./qualityProtocol');

function prompt(content) {
  return 'Sérialise le livrable fourni dans son enveloppe native complète. Ne réécris ni ne raccourcis le candidat. '
    + 'Ses caractères sont fixés par le schéma. Produis toi-même les métadonnées et les évaluations des vrais handoffs reçus. '
    + 'N’invente aucune preuve, aucun acquittement ni critère satisfait.\n' + JSON.stringify({ artifact: content });
}

async function materialize(context, candidate) {
  if (!candidate.construction || typeof context.input.materializer !== 'function') return candidate;
  const content = await validatedCall({ ...context, callback: context.input.materializer }, {
    operation: 'native_artifact_materialization', stage: 'draft', iteration: context.iteration,
    artifactContent: candidate.content, prompt: prompt(candidate.content)
  }, value => {
    if (value !== candidate.content) throw fail('GQEL_MATERIALIZATION_CHANGED', 'Native envelope changed the authored candidate.');
    return value;
  });
  return { ...candidate, content };
}

function responseFormat(mission, content) {
  if (typeof content !== 'string' || !content.trim()) throw fail('GQEL_ARTIFACT_INVALID', 'Complete authored content required.');
  const format = structuredClone(require('../workerEvidenceIdentityPrompt').workerResponseFormat(mission));
  format.schema.allOf ||= [];
  format.schema.allOf.push({ properties: { workerArtifact: { properties: {
    content: { properties: { candidate: { const: content } }, required: ['candidate'] }
  }, required: ['content'] } }, required: ['workerArtifact'] });
  return format;
}

module.exports = { materialize, responseFormat };
