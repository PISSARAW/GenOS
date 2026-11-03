'use strict';

const { digest, fail } = require('./qualityContract');
const { qualityMissionFields } = require('./qualityMissionContract');

function aliases(member) {
  return [member.memberId, member.workerId, member.label, member.role, member.subSystem].filter(Boolean);
}

function findMember(members, selector) {
  const found = members.filter(member => aliases(member).includes(selector));
  if (found.length !== 1) throw fail('GQEL_FINAL_PRODUCER_AMBIGUOUS', 'Final artifact selector must identify one canonical integration member.');
  return found[0];
}

function dependencyMembers(members, member) {
  return (member.dependsOn || []).map(selector => findMember(members, selector));
}

function terminalMember(members) {
  const consumed = new Set(members.flatMap(member => dependencyMembers(members, member)));
  const terminals = members.filter(member => !consumed.has(member));
  if (terminals.length !== 1) throw fail('GQEL_FINAL_PRODUCER_AMBIGUOUS', 'A collective quality contract needs one final integration member; independent outputs cannot be concatenated implicitly.');
  return terminals[0];
}

function assertProducerCoverage(members, selected) {
  const visited = new Set(), queue = dependencyMembers(members, selected);
  while (queue.length) {
    const member = queue.shift();
    if (visited.has(member)) continue;
    visited.add(member); queue.push(...dependencyMembers(members, member));
  }
  if (visited.has(selected) || members.some(member => member !== selected && !visited.has(member))) {
    throw fail('GQEL_FINAL_PRODUCER_COVERAGE', 'The final integration member must depend on every other contribution through an acyclic handoff graph.');
  }
}

function attachFinalQuality(member, fields) {
  if (member.qualityElevation && digest(member.qualityElevation) !== digest(fields.qualityElevation)) {
    throw fail('GQEL_CONTRACT_CHANGED', 'Final integration member has a different quality obligation.');
  }
  if (member.qualityRuntime && digest(member.qualityRuntime) !== digest(fields.qualityRuntime)) {
    throw fail('GQEL_CONTRACT_CHANGED', 'Final integration routes differ from the collective quality policy.');
  }
  return { ...member, ...fields };
}

function configureFinalArtifact(input) {
  const fields = qualityMissionFields({ ...input, prompt: input.goal });
  if (!fields.qualityElevation) return input;
  require('./qualityFinalRequest').assertTeamFinalStage(input);
  const members = input.members || [], selector = fields.qualityRuntime.finalArtifactMemberId;
  const selected = selector ? findMember(members, selector) : terminalMember(members);
  assertProducerCoverage(members, selected);
  assertScreenplayProducer(selected, fields);
  return { ...input, ...fields, finalArtifactMemberId: selected.memberId,
    members: members.map(member => member === selected || screenplayAuthor(member, fields)
      ? attachFinalQuality(member, fields) : member) };
}

function screenplayAuthor(member, fields) {
  if (fields.qualityElevation.profile !== 'screenplay') return false;
  const kind = member.workerKind || require('../agents/workerKindService').resolveWorkerKind(undefined, member.role);
  return kind === 'creative_worker';
}

function assertScreenplayProducer(member, fields) {
  if (fields.qualityElevation.profile !== 'screenplay' || screenplayAuthor(member, fields)) return;
  throw fail('GQEL_FINAL_PRODUCER_KIND_INVALID', 'A screenplay final producer must deliver a creative candidate; a verification report is not the screenplay.');
}

function assertFinalPlan(run) {
  if (!run.qualityElevation) return;
  require('./qualityFinalRequest').assertTeamFinalStage(run);
  const fields = qualityMissionFields(run), selected = findMember(run.members, run.finalArtifactMemberId);
  assertProducerCoverage(run.members, selected);
  if (digest(selected.qualityElevation || null) !== digest(fields.qualityElevation)
    || digest(selected.qualityRuntime || {}) !== digest(fields.qualityRuntime)) {
    throw fail('GQEL_CONTRACT_CHANGED', 'The final producer must retain the exact collective quality obligation and routes.');
  }
}

function assertFinalPlanUnchanged(current, next) {
  const key = run => ({ contract: run.qualityElevation ?? null, runtime: run.qualityRuntime ?? null,
    finalArtifactMemberId: run.finalArtifactMemberId ?? null });
  if (digest(key(current)) !== digest(key(next))) throw fail('GQEL_CONTRACT_CHANGED', 'A formed collective quality obligation cannot be replaced or removed.');
}

module.exports = { configureFinalArtifact, assertProducerCoverage, findMember, assertFinalPlan, assertFinalPlanUnchanged };
