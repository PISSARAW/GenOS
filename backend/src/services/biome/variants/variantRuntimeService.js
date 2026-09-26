'use strict';

const resource = require('./resourceEcologyController');
const exploration = require('./explorationController');
const qualityDiversity = require('./qualityDiversityController');
const succession = require('./successionController');
const resilience = require('./resilienceController');
const persistent = require('./persistentEcologyController');
const openEnded = require('./openEndedController');
const adversarial = require('./adversarialEcologyController');
const knowledge = require('./knowledgeEcologyController');
const compute = require('./computeScheduler');
const multiScale = require('./multiscaleController');

const controllers = {
  resource: ({ ecology, input }) => resource.advance(ecology, input),
  exploration: ({ ecology, state, input }) => exploration.advance(ecology, state, input),
  quality_diversity: ({ ecology, state, input }) => qualityDiversity.advance(ecology, state, input),
  successional: ({ ecology, state, input }) => succession.advance(ecology, state, input),
  resilience: ({ ecology, state, input }) => resilience.advance(ecology, state, input),
  persistent: (context) => persistent.advance(context),
  open_ended: ({ ecology, state, input }) => openEnded.advance(ecology, state, input),
  adversarial: ({ ecology, state, input }) => adversarial.advance(ecology, state, input),
  knowledge: ({ ecology, state, input }) => knowledge.advance(ecology, state, input),
  compute: ({ state, input }) => compute.advance(state, input),
  multi_scale: ({ ecology, state, input }) => multiScale.advance(ecology, state, input)
};

function advance({ ecology, variant, state = {}, input = {}, matrix }) {
  const controller = controllers[variant];
  if (!controller) throw variantError('Unknown Biome variant.', 'BIOME_VARIANT_UNKNOWN');
  const result = controller({ ecology, state, input, matrix });
  return { variant, state: result.state || state, decision: result.decision, action: result.action };
}

function variantError(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { advance };
