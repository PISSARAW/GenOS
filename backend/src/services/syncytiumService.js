const biologicalMode = require('./biologicalModeService');
const { createSyncytiumCrdt } = require('./syncytiumCrdtService');

const SYNCYTIUM_SIGNALS = [
  /\bsyncytium\b/i,
  /\bshared[ -]?state\b/i,
  /\bétat[ -]?partagé\b/i,
  /\bcrdt\b/i,
  /\bcontinuous[ -]?sync\b/i,
  /\bsynchronisation[ -]?continue\b/i,
  /\bcollaborati\w*\b/i,
  /\btime[ -]?travel\b/i
];

// A single keyword is too weak a signal to spin up four synchronized agents.
const MIN_SYNCYTIUM_SIGNALS = 2;

function countMatches(text) {
  return SYNCYTIUM_SIGNALS.reduce((count, regex) => count + (regex.test(text) ? 1 : 0), 0);
}

function analyzeMission(mission) {
  const text = String(mission || '');
  const score = countMatches(text);
  const recommended = score >= MIN_SYNCYTIUM_SIGNALS;
  const composition = recommended ? biologicalMode.compose('syncytium', text) : [];
  return {
    recommended,
    mode: 'syncytium',
    crdtReady: recommended,
    frequency: recommended ? '< 1s' : 'not recommended',
    signalsCount: score,
    roles: [
      'shared_state_coordinator',
      'parallel_executor',
      'consistency_guardian',
      'integration_executor'
    ],
    members: composition
  };
}

function compose(mission) {
  return biologicalMode.compose('syncytium', mission);
}

function createCrdtSession() {
  return createSyncytiumCrdt();
}

module.exports = {
  analyzeMission,
  compose,
  createCrdtSession
};
