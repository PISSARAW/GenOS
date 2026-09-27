'use strict';

function pidRecommendation(input) {
  const data = input || {};
  const target = Number(data.target) || 0; const measured = Number(data.measured) || 0;
  const error = target - measured; const integral = Number(data.integral) || 0; const derivative = error - (Number(data.previousError) || 0);
  const output = Number((error * (Number(data.kp) || 1) + (integral + error) * (Number(data.ki) || 0) + derivative * (Number(data.kd) || 0)).toFixed(4));
  return { error, integral: integral + error, derivative, output };
}

function admissibleVerdict(receipt, context) {
  const valid = receipt?.contractType === 'CausalInterventionReceipt' && receipt?.payload?.verdict;
  const contextual = context?.protocolId && context?.manifestHash;
  return { admissible: Boolean(valid && contextual), reason: valid && contextual ? 'context_bound' : 'missing_context_or_receipt', protocolId: context?.protocolId || null };
}

function transition(input) {
  const verdict = admissibleVerdict(input?.receipt, input?.context);
  return { from: input?.from || 'candidate', to: verdict.admissible ? (input.receipt.payload.verdict === 'supported' ? 'recommended' : 'inconclusive') : 'blocked', verdict };
}

module.exports = { pidRecommendation, admissibleVerdict, transition };
