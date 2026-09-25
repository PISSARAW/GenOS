'use strict';

function reviewPrompt(member, results) {
  const own = results.find((result) => result.role === member.role);
  const candidates = transferableCandidates(results, member.role);
  const candidateText = candidates.length
    ? JSON.stringify(candidates)
    : 'Aucune idée transférable étayée n’est disponible.';
  return `${member.mission}\n\nYOUR INITIAL RESULT: ${String(own?.answer || 'No result.').slice(0, 1200)}\n` +
    `TRANSFERABLE IDEAS ONLY (not peer solutions): ${candidateText}\n\n` +
    'Keep your assigned method and local constraints. Test each idea against your own inputs and compute your own fitness before and after. ' +
    'Do not copy a peer answer, schedule, implementation, or complete solution. Return migrationDecisions as JSON objects with ideaId, decision (accepted/rejected), reason, localValidation, fitnessBefore, fitnessAfter, fitnessDirection (minimize/maximize), and evidenceRefs. ' +
    'Accept only a locally reproduced improvement with evidence references; otherwise reject it. Include transferableIdeas as bounded techniques or counterexamples, never solutions.';
}

function transferableCandidates(results, receiverRole) {
  return results.filter((result) => result.role !== receiverRole)
    .flatMap((result) => cleanIdeas(result.transferableIdeas, result.role));
}

function cleanIdeas(ideas, sourceRole) {
  if (!Array.isArray(ideas)) return [];
  return ideas.map((idea, index) => normalizeIdea(idea, sourceRole, index)).filter(Boolean);
}

function normalizeIdea(idea, sourceRole, index) {
  if (!idea || typeof idea !== 'object' || idea.solution || idea.fullAnswer || idea.code) return null;
  const technique = shortText(idea.technique, 500);
  const rationale = shortText(idea.rationale, 500);
  const evidenceRefs = stringRefs(idea.evidenceRefs);
  if (!technique || !rationale || !evidenceRefs.length) return null;
  return { ideaId: shortText(idea.ideaId, 100) || `${sourceRole}-idea-${index + 1}`, sourceRole, technique, rationale, evidenceRefs };
}

function validateReviewDecisions(input) {
  const candidates = new Set((input.candidates || []).map((candidate) => candidate.ideaId));
  const decisions = Array.isArray(input.decisions) ? input.decisions : [];
  return decisions.map((decision) => validateOneDecision(decision, input, candidates));
}

function reviewContext(mission) {
  const match = String(mission || '').match(/YOUR INITIAL RESULT: ([\s\S]*?)\nTRANSFERABLE IDEAS ONLY \(not peer solutions\): ([\s\S]*?)\n\n/);
  if (!match) return { baselineAnswer: '', candidates: [] };
  try {
    return { baselineAnswer: match[1].trim(), candidates: JSON.parse(match[2]) };
  } catch (_) {
    return { baselineAnswer: match[1].trim(), candidates: [] };
  }
}

function validateOneDecision(decision, input, candidates) {
  const ideaId = shortText(decision?.ideaId, 100);
  const reason = shortText(decision?.reason, 500) || 'No local validation reason supplied.';
  const evidenceRefs = stringRefs(decision?.evidenceRefs);
  const claimedAccepted = decision?.decision === 'accepted';
  const baseline = input.baselineValidation;
  const final = input.finalValidation;
  const improvement = schedulingImproved(baseline, final, decision?.fitnessDirection);
  const accepted = Boolean(claimedAccepted && candidates.has(ideaId) && decision.localValidation === true
    && evidenceRefs.length && improvement);
  return {
    ideaId: ideaId || 'unknown', decision: accepted ? 'accepted' : 'rejected', reason,
    localValidation: accepted, evidenceRefs,
    validationReason: accepted ? 'receiver reproduced a verified local fitness improvement' : rejectionReason({
      claimedAccepted, ideaId, candidates, decision, evidenceRefs, improvement
    })
  };
}

function schedulingImproved(before, after, direction) {
  if (!before?.applicable || !before.valid || !after?.applicable || !after.valid) return false;
  if (!Number.isFinite(before.computedMakespan) || !Number.isFinite(after.computedMakespan)) return false;
  return direction === 'minimize' && after.computedMakespan < before.computedMakespan;
}

function rejectionReason(input) {
  if (!input.claimedAccepted) return 'receiver rejected the candidate';
  if (!input.candidates.has(input.ideaId)) return 'candidate was not among the ideas supplied to this receiver';
  if (input.decision.localValidation !== true || !input.evidenceRefs.length) return 'local evidence is missing';
  if (!input.improvement) return 'no independently verified local fitness improvement';
  return 'candidate did not pass local migration validation';
}

function shortText(value, limit) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : '';
}

function stringRefs(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).slice(0, 8) : [];
}

module.exports = { reviewPrompt, transferableCandidates, validateReviewDecisions, reviewContext };
