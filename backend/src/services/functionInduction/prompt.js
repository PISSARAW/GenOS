'use strict';

function publicSamples(context) {
  const groups = new Map();
  for (const row of context.observations) {
    const key = row.op + ' epoch ' + row.epoch;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([row.x, row.y]);
  }
  return [...groups].map(([key, samples]) => key + ' samples [x,y]: ' + JSON.stringify(samples)).join('\n');
}

function fromMission(mission) {
  const method = mission.workerContract?.mission?.methodContract || mission.methodContract;
  if (method?.evaluator?.domain !== require('./contract').DOMAIN) return '';
  const context = method.parameters?.context;
  if (!require('./contract').contextValid(context)) throw Error('FUNCTION_INDUCTION_CONTEXT_INVALID');
  return 'GenOS bounded numerical worker. Identity: ' + JSON.stringify({agentId: mission.agentId,
    missionId: mission.missionId, role: mission.role, workerKind: mission.workerKind})
    + '\nReturn only the requested JSON object. Claim "Candidate programs were proposed" with evidence ["mission"]. '
    + 'Use uncertainties []. ' + kindFields(mission) + '\n' + instruction(context) + encodingInstruction(method);
}

function encodingInstruction(method) {
  if (method.parameters.outputEncoding !== 'operator-keyed/v1') return '';
  return '\nOUTPUT ENCODING: functionPrograms.rules is a JSON object, with exactly one property per requested pair: '
    + JSON.stringify(method.parameters.context.requested.map(require('./contract').key))
    + '. Each value contains that same op and epoch, kind, a, b, c, confidence and reason. Do not use an array.';
}

function kindFields(mission) {
  const strategies = (mission.strategyContract?.strategy_portfolio || []).map(item => item.id);
  const hints = {
    bounded_worker: 'Use scopeCompletion {"scopeRef":"mission","completedRefs":["mission"]}.',
    specialist: 'Use specialtyAssessment with inScope true, evidence ["mission"], niche '
      + JSON.stringify(mission.specialtyNiche || mission.workerContract?.mission?.specialtyNiche || 'data') + '.',
    adaptive_worker: 'Use strategyTrace to describe your actual arithmetic strategy decision, with evidence ["mission"]. '
      + 'The sealed strategy portfolio IDs are ' + JSON.stringify(strategies) + '.',
    verifier_worker: 'Use workerArtifact verification_report. Describe your own public arithmetic in testedClaim, '
      + 'verificationMethod, verdict and reproductionSteps. Cite only mission. Native verification results are not available yet. '
      + 'Use at most three concise reproductionSteps: formulas and one worked example suffice; do not repeat a derivation for each operator.'
  };
  return hints[mission.workerKind] || '';
}

function instruction(context) {
  return 'CURRENT SEALED MATHEMATICAL TASK. Derive the actual function for EACH requested operator and epoch. '
    + 'Use only the public samples below. Do not copy illustrative coefficients from unrelated instructions. '
    + 'The possible functions are affine a*x+b (c=0), quadratic a*x*x+b*x+c, '
    + 'or hinge a*x+b+c*max(0,x-5), with integer coefficients -3..3. '
    + 'Compute coefficients and check EVERY supplied sample before choosing a function. '
    + 'For quadratic: a=(y(1)+y(-1)-2*y(0))/2, b=(y(1)-y(-1))/2, c=y(0). '
    + 'For affine or hinge: b=y(0), a=y(1)-y(0); hinge c=(y(7)-7*a-b)/2. '
    + 'Equivalent formulas for the same function are not ambiguity. '
    + 'At x=0 alone, slopes and curvature remain unknown. If several distinct functions fit, declare ambiguous. '
    + 'If there are no samples for the requested pair, declare missing. '
    + 'For either ignorance declaration use kind unknown, a=b=c=0, confidence=0, reason ambiguous or missing. '
    + 'For a uniquely determined function use the computed coefficients, reason answerable and confidence 0.5..1. '
    + 'Return outcome success with one rule per requested pair in functionPrograms.rules, '
    + 'and the normal evidence fields required by your worker kind. '
    + 'Cite mission for the candidate-program claim. Do not claim independent verification or heldout performance. '
    + '\nREQUESTED: ' + JSON.stringify(context.requested)
    + '\nPUBLIC SAMPLES (all rows retained):\n' + publicSamples(context)
    + '\nPREVIOUS PUBLICLY VALIDATED RULES: ' + JSON.stringify(context.learnedRules || [])
    + '\nAFFINE HINTS: ' + JSON.stringify(context.affinePrograms || []);
}

module.exports = {publicSamples, fromMission, instruction};
