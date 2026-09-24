'use strict';

const store = require('../holobiontStore');
const teamRuns = require('../../aTeam/teamRunStore');

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'HOLOBIONT_ATEAM_INVALID' });
  return text;
}

function verifiedTeam(run) {
  if (run.status !== 'COMPLETED' || !run.members.length || run.members.some((member) => member.status !== 'COMPLETED')) {
    throw Object.assign(new Error('Only a completed A-Team run can be offered as a symbiont.'), { code: 'HOLOBIONT_ATEAM_RUN_INCOMPLETE' });
  }
  return run;
}

function teamCapabilities(run) {
  const declared = run.requiredCapabilities.map((item) => item.name || item.capability);
  const memberCapabilities = run.members.flatMap((member) => member.capabilities);
  return [...new Set([...declared, ...memberCapabilities].map((item) => String(item || '').trim()).filter(Boolean))];
}

function evidence(value) {
  if (!Array.isArray(value) || !value.length) {
    throw Object.assign(new Error('A-Team integration requires delivery evidence.'), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
  }
  return [...new Set(value.map((item) => requiredText(item, 'evidence reference')))];
}

async function registerAteamCandidate(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw Object.assign(new Error('Holobiont session not found.'), { code: 'HOLOBIONT_SESSION_NOT_FOUND' });
  if (session.scope !== 'PERSISTENT') {
    throw Object.assign(new Error('A-Team symbionts require a persistent Host.'), { code: 'HOLOBIONT_PERSISTENT_HOST_REQUIRED' });
  }
  if (Number(input.expectedSessionRevision) !== session.revision) {
    throw Object.assign(new Error('Holobiont revision conflict.'), { code: 'HOLOBIONT_REVISION_CONFLICT' });
  }
  const teamRunId = requiredText(input.teamRunId, 'teamRunId');
  const run = verifiedTeam(await teamRuns.load(db, teamRunId));
  const evidenceRefs = evidence(input.evidenceRefs);
  const symbiontId = `a-team:${run.teamRunId}`;
  const candidate = {
    kind: 'SUB_TOPOLOGY', topology: 'a_team', teamRunId: run.teamRunId,
    missionId: run.missionId, capabilities: teamCapabilities(run), evidenceRefs,
    memberIds: run.members.map((member) => member.memberId), authorityBoundary: 'HOST_RETAINS_FINAL_AUTHORITY',
    cadence: 'ON_DEMAND', scope: 'PERSISTENT'
  };
  const revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, expectedRevision: session.revision,
    eventType: 'SYMBIONT_DISCOVERED', actorId: input.actorId,
    payload: { symbiontId, symbiont: candidate }
  });
  return { symbiontId, candidate, status: 'CANDIDATE', sessionRevision: revision };
}

module.exports = { registerAteamCandidate };
