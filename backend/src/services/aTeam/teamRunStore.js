'use strict';

const { randomUUID } = require('crypto');
const sessionStore = require('../topologySessionStore');
const { validateTeamRun } = require('./contracts/teamRunContract');
const { MEMBER_STATUS } = require('./constants');

const TOPOLOGY = 'a_team';

function choose(values, fallback) {
  const selected = values.find((value) => value !== undefined && value !== null && value !== '');
  return selected === undefined ? fallback : selected;
}

function memberRecord(source = {}) {
  return {
    memberId: choose([source.memberId, source.workerId], randomUUID()),
    agentId: choose([source.agentId, source.workerId], null),
    role: choose([source.role], 'specialist'),
    domain: choose([source.domain, source.subSystem, source.label], null),
    expertise: asList(choose([source.expertise, source.capabilities], [])),
    ownedResponsibilities: asList(choose([source.ownedResponsibilities, source.responsibilities], [])),
    consumes: asList(choose([source.consumes, source.dependsOn], [])),
    provides: asList(choose([source.provides, source.outputs], [])),
    consults: asList(source.consults),
    participationMode: choose([source.participationMode], 'FULL'),
    authority: choose([source.authority], emptyAuthority()),
    toolLease: asList(source.toolLease),
    status: choose([source.status], MEMBER_STATUS[0])
  };
}

function asList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim());
}

function emptyAuthority() {
  return { owns: [], mayModify: [], mayPropose: [], mustConsult: [], mayRead: [], cannotOverride: [] };
}

function teamRunRecord(input = {}) {
  return {
    teamRunId: choose([input.teamRunId], randomUUID()),
    missionId: input.missionId,
    goal: String(choose([input.goal], '')).trim(),
    successCriteria: asList(input.successCriteria),
    workGraphId: choose([input.workGraphId], null),
    organization: choose([input.organization], null),
    members: (Array.isArray(input.members) ? input.members : []).map(memberRecord),
    requiredCapabilities: Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : [],
    capabilityGaps: asList(input.capabilityGaps),
    status: choose([input.status], 'FORMING'),
    phase: choose([input.phase], 'ELIGIBILITY'),
    createdAt: choose([input.createdAt], new Date().toISOString())
  };
}

function assertValid(run) {
  const validation = validateTeamRun(run);
  if (validation.valid) return;
  throw Object.assign(new Error(validation.errors.join(' ')), { code: 'ATEAM_RUN_INVALID', errors: validation.errors });
}

async function create(db, input) {
  const run = teamRunRecord(input);
  assertValid(run);
  const saved = await sessionStore.save(db, { id: run.teamRunId, topology: TOPOLOGY, state: run });
  return { ...run, revision: saved.revision };
}

async function load(db, teamRunId) {
  const stored = await sessionStore.load(db, teamRunId);
  if (!stored || stored.topology !== TOPOLOGY) return null;
  const run = { ...stored.state, revision: stored.revision };
  assertValid(run);
  return run;
}

async function update(options = {}) {
  const { db, teamRunId, revision, patch = {} } = options;
  if (!Number.isInteger(revision) || revision < 0) {
    throw Object.assign(new Error('A-Team run updates require the current revision.'), { code: 'ATEAM_RUN_REVISION_REQUIRED' });
  }
  const current = await load(db, teamRunId);
  if (!current) throw Object.assign(new Error(`Unknown A-Team run '${teamRunId}'.`), { code: 'ATEAM_RUN_UNKNOWN' });
  if (current.revision !== revision) throw revisionConflict(teamRunId);
  const next = { ...current, ...patch, teamRunId, missionId: current.missionId, createdAt: current.createdAt };
  delete next.revision;
  assertValid(next);
  const saved = await saveRevision({ db, teamRunId, state: next, revision });
  return { ...next, revision: saved.revision };
}

async function saveRevision({ db, teamRunId, state, revision }) {
  try {
    return await sessionStore.save(db, { id: teamRunId, topology: TOPOLOGY, state, revision });
  } catch (error) {
    if (error.code !== 'TOPOLOGY_SESSION_CONFLICT') throw error;
    throw revisionConflict(teamRunId);
  }
}

function revisionConflict(teamRunId) {
  return Object.assign(new Error(`A-Team run revision conflict for '${teamRunId}'.`), { code: 'ATEAM_RUN_CONFLICT' });
}

module.exports = { TOPOLOGY, teamRunRecord, create, load, update };
