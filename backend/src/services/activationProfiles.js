'use strict';

const fs = require('node:fs');
const scheduler = require('./endogenousThoughtResidentSchedulerService');
const materializers = require('./gqwf/materializerPolicy');

const PROFILES = Object.freeze({
  observe: Object.freeze({ agow: 'shadow', gns: true, gqwf: false, ett: false }),
  bounded: Object.freeze({ agow: 'bounded', gns: true, gqwf: true, ett: false }),
  resident: Object.freeze({ agow: 'bounded', gns: true, gqwf: true, ett: true })
});

function profile(name) {
  if (!Object.hasOwn(PROFILES, name)) throw new Error('ACTIVATION_PROFILE_UNKNOWN');
  const selected = PROFILES[name];
  return { schema: 'genos.activation-profile/v1', name, ...selected,
    env: { GENOS_AGOW_MODE: selected.agow, GENOS_NERVOUS_ENABLED: selected.gns ? '1' : '0' },
    executionPolicy: { gqwfV2: selected.gqwf }, residentScheduler: { enabled: selected.ett } };
}

function databaseReady(db) {
  return Boolean(db && typeof db.get === 'function' && typeof db.all === 'function'
    && typeof db.run === 'function');
}

function workspaceReady(mission) {
  try {
    if (!fs.statSync(mission.workspaceRoot).isDirectory()) return false;
    materializers.validateMission(mission);
    return Boolean(mission.workspaceId);
  } catch { return false; }
}

function mechanism(enabled, configured, missing) {
  return { enabled, configured, ready: enabled && configured && missing.length === 0,
    missing, qualified: null };
}

function inspect(input) {
  const selected = profile(input.profile);
  const env = input.env || process.env, mission = input.mission || {};
  const db = databaseReady(input.db);
  const ett = scheduler.readiness({ ...input.ett, enabled: selected.ett && input.ett?.enabled === true });
  const mechanisms = {
    agow: mechanism(true, env.GENOS_AGOW_MODE === selected.agow, db ? [] : ['database']),
    gns: mechanism(selected.gns, env.GENOS_NERVOUS_ENABLED === '1',
      input.durableDatabase === true && db ? [] : ['durable-database']),
    gqwf: mechanism(selected.gqwf, mission.executionPolicy?.gqwfV2 === true,
      db && workspaceReady(mission) ? [] : ['registered-workspace-and-database']),
    ett: mechanism(selected.ett, input.ett?.enabled === true, ett.status === 'ready' ? [] : [ett.reason, ...ett.missing])
  };
  return { profile: selected, mechanisms,
    dependenciesReady: Object.values(mechanisms).filter(item => item.enabled).every(item => item.ready),
    authority: 'checked-at-action-boundary', activated: null, qualified: null };
}

module.exports = { PROFILES, profile, inspect };
