'use strict';

function collectMechanisms(members) {
  const seen = new Set();
  for (const member of Array.isArray(members) ? members : []) {
    for (const mechanism of member.mechanisms || []) seen.add(mechanism);
  }
  return [...seen];
}

function metapopulationComplete(accepted, members) {
  const reviewedComplete = accepted.length === members.length && accepted.every((member) => isVerifiedResult(member.result));
  return reviewedComplete;
}

function isVerifiedResult(result) {
  return result?.status === 'completed' && result.methodValidated !== false && result.domainValidation?.valid !== false;
}

function populationAnswer(member) {
  const review = isVerifiedResult(member.result) ? member.result.answer : null;
  if (review) return review;
  const initial = member.result?.initialResults?.find((result) => result.role === member.role);
  return isVerifiedResult(initial) ? initial.answer : 'Aucune réponse vérifiée.';
}

module.exports = { collectMechanisms, metapopulationComplete, isVerifiedResult, populationAnswer };