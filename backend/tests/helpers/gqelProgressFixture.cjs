'use strict';
const { compileQualityContract, executeElevationLoop } = require('../../src/services/qualityElevation/qualityElevationService');
const { CALIBRATION } = require('../../src/services/qualityElevation/qualityReviewService');
const GOOD = 'INT. ARCHIVES - NUIT\nInès glisse la copie sous la vitre. Le gardien compare la signature au registre, déverrouille la porte et recule. Inès franchit le seuil.';
const BAD = 'INT. ARCHIVES - NUIT\nUne confrontation révèle la vérité et rend Inès libre. La scène est intense.';
function reply(content, overrides = {}) { return { content, usage: { inputTokens: 10, outputTokens: 20 }, finishReason: 'stop', model: 'mock:only', ...overrides }; }
function payload(request) { return JSON.parse(request.prompt.slice(request.prompt.indexOf('\n') + 1)); }
function checks(data, verdict = 'pass') {
  return { checks: data.criteria.map(criterion => ({ criterionId: criterion.id, verdict,
    rating: criterion.kind === 'soft' ? 4 : null, reason: 'Évaluation synthétique pour tester le contrôleur, pas la qualité artistique.',
    evidence: [{ quote: data.artifact.slice(0, Math.min(70, data.artifact.length)) }] })) };
}
function samplePlan(minutes = 1) {
  return { premise: 'Inès doit sortir avec une preuve.', rules: ['La porte reste verrouillée sans validation du registre.'],
    characters: [{ name: 'Inès', want: 'sortir', fear: 'être retenue', knowledge: 'elle connaît la signature' }],
    scenes: [{ id: 'S1', heading: 'INT. ARCHIVES - NUIT', goal: 'sortir', obstacle: 'porte verrouillée', decision: 'présenter la preuve',
      consequence: 'le gardien ouvre', stateAfter: 'Inès sort', plannedMinutes: minutes, timingRationale: 'vérification silencieuse du document' }] };
}
function reviewer(transform) {
  return { id: 'critic-1', model: 'mock:only', review: async request => {
    const data = payload(request);
    if (request.operation === 'reviewer_control') return reply(checks(data, data.artifact === CALIBRATION[0].text ? 'fail' : 'pass'));
    const value = checks(data);
    return reply(transform ? transform(value, data, request) : value);
  } };
}
function contract(overrides = {}) {
  return compileQualityContract({ policy: 'fast', domain: 'creative_writing', mission: 'Écrire un scénario.',
    requireCalibration: false, maxIterations: 1, ...overrides });
}
function execute(options = {}) {
  return executeElevationLoop({ contract: contract(), reviewers: [reviewer()],
    generator: async request => reply(request.stage === 'plan' ? samplePlan() : GOOD), ...options });
}
module.exports = { GOOD, BAD, reply, payload, checks, samplePlan, reviewer, contract, execute };
