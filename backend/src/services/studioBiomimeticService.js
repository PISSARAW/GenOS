'use strict';
const { agent, failure } = require('./studioWorldsService');
const input = require('./studioSpecialistInput');
const curiosity = require('./curiosityService');

function domainRecord(value) {
  const record = input.object(value);
  if (!Array.isArray(record.errorHistory)) throw failure('SPECIALIST_INPUT_INVALID', 400);
  const result = { errorHistory: record.errorHistory.map(item => input.number(item, [0, 1])) };
  for (const key of ['seenCount', 'knownAffordanceCount', 'testedAffordanceCount', 'totalAffordanceCount']) {
    result[key] = input.number(record[key] ?? 0, [0, 1000000]);
  }
  for (const key of ['predictionVariance', 'cost', 'risk']) result[key] = input.number(record[key] ?? 0, [0, 1]);
  return result;
}

async function creative(db, context) {
  await agent(db, context);
  const prompt = input.text(context.body.prompt, 2000);
  const representation = input.text(context.body.representation, 500);
  const record = domainRecord(context.body.domainRecord);
  const enrichment = require('./ncePromptService').enhancePromptWithNCE(prompt, { representations: [{ description: representation }] });
  return input.record(db, context, { mechanism: 'nce_curiosity_representation', input: { prompt, representation, domainRecord: record },
    result: { curiosityScore: curiosity.computeCuriosity(record), learningProgress: curiosity.learningProgressScore(record),
      enhancedPrompt: enrichment.enhancedPrompt, inputAuthority: 'declared', runtimeApplied: false,
      creativeScope: 'curiosity_and_prompt_representation', creativeEffectMeasured: false } });
}

async function physics(db, context) {
  await agent(db, context);
  const parameters = {};
  for (const [key, bounds] of Object.entries({ voltage: [0, 100], distance: [0, 100], lambda: [0.001, 100],
    density: [0.001, 100], threshold: [0.001, 100] })) parameters[key] = input.number(context.body[key], bounds);
  const engine = require('./neurobiologyBiophysics');
  const attenuatedVoltage = engine.calculateRallAttenuation(parameters.voltage, parameters.distance, parameters.lambda);
  const spike = engine.evaluateNmdaSpike(attenuatedVoltage, parameters.density, parameters.threshold);
  return input.record(db, context, { mechanism: 'rall_nmda', input: parameters,
    result: { attenuatedVoltage, outputVoltage: spike.voltage, isNmdaSpike: spike.isNmdaSpike,
      inputAuthority: 'declared', runtimeApplied: false, physicalScope: 'biophysical_model', hostEffectMeasured: false } });
}

module.exports = { creative, physics };
