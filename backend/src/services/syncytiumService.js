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

function countMatches(text) {
  return SYNCYTIUM_SIGNALS.reduce((count, regex) => count + (regex.test(text) ? 1 : 0), 0);
}

function analyzeMission(mission) {
  const text = String(mission || '');
  const score = countMatches(text);
  const recommended = score >= 1;
  const composition = recommended ? biologicalMode.compose('syncytium', text) : [];
  return {
    recommended,
    mode: 'syncytium',
    crdtReady: true,
    frequency: '< 1s',
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
