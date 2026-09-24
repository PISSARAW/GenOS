'use strict';

const REVIEWERS = Object.freeze([
  { specialty: 'assumption', tags: ['assumption', 'assumptions'], prompt: 'Identify hidden or unsupported assumptions.' },
  { specialty: 'counterexample', tags: ['counterexample', 'falsification'], prompt: 'Find a concrete counterexample or falsifying case.' },
  { specialty: 'evidence', tags: ['evidence', 'sources'], prompt: 'Check whether cited evidence supports the claim.' },
  { specialty: 'logic', tags: ['logic', 'reasoning'], prompt: 'Check inference validity and internal consistency.' },
  { specialty: 'adversarial', tags: ['adversarial', 'security', 'risk'], prompt: 'Attempt to defeat the claim under its stated scope.' }
]);

function route(input) {
  const required = claimTags(input.claim);
  const quarantine = new Set(input.quarantinedMemberIds || []);
  const available = (input.members || []).filter((member) => isReviewer(member) && !quarantine.has(member.memberId || member.id));
  const assigned = available.map((member) => assignment(member, required));
  const matching = assigned.filter((item) => item.specialties.length);
  const selected = matching.length ? matching : assigned.slice(0, 1);
  return {
    claimId: input.claim.claimId || null,
    reviewers: selected.map((item) => ({
      memberId: item.memberId, specialties: item.specialties,
      prompts: item.specialties.map((name) => REVIEWERS.find((reviewer) => reviewer.specialty === name).prompt)
    })),
    unassigned: selected.length === 0,
    reason: matching.length ? 'specialty_match' : 'fallback_review'
  };
}

function isReviewer(member) {
  return ['reviewer', 'adversarial_reviewer'].includes(member.role);
}

function assignment(member, required) {
  const capabilities = member.capabilities || member.expertise || [];
  const tags = normalizeTags(capabilities);
  return {
    memberId: member.memberId || member.id,
    specialties: REVIEWERS.filter((reviewer) => tags.some((tag) => reviewer.tags.includes(tag))
      && (!required.length || required.some((tag) => reviewer.tags.includes(tag)))).map((reviewer) => reviewer.specialty)
  };
}

function claimTags(claim) {
  const type = String(claim.type || claim.risk || '').toLowerCase();
  if (type.includes('security')) return ['security', 'risk'];
  if (type.includes('math')) return ['logic'];
  if (type.includes('source') || type.includes('factual')) return ['evidence', 'sources'];
  if (type.includes('assumption')) return ['assumption'];
  return ['counterexample', 'adversarial'];
}

function normalizeTags(values) {
  const items = Array.isArray(values) ? values : [values];
  return items.map((value) => String(value).toLowerCase());
}

module.exports = { route };
