'use strict';

const phenotypes = require('./specialization/phenotypeService');
const execution = require('./specialization/phenotypeExecutionService');

const ORGANELLES = Object.freeze(['cartography', 'interoception', 'natural-search', 'findings',
  'verification', 'stigmergy', 'handoff', 'reconciliation']);
const AUTHORITY = Object.freeze({ filesystemWrite: false, gitPush: false, merge: false,
  allowedSignals: Object.freeze(['READ', 'INDEX', 'OBSERVE', 'TEST_SAFE', 'SNAPSHOT', 'SIGNAL']) });

function describeTypes() {
  return {
    apiVersion: 'genos.daemon/v1', archetype: 'ResidentDaemon', organelles: [...ORGANELLES],
    authority: { ...AUTHORITY, allowedSignals: [...AUTHORITY.allowedSignals] },
    phenotypes: phenotypes.FAMILIES.map((family) => ({ ...phenotypes.describePhenotype(family),
      detectors: [...execution.DETECTORS[family]] })),
    auxiliaries: ['ScoutCells', 'SentinelDaemonKeeper'],
    compatibility: { WorkspaceGitDaemon: { autofix: false, successor: 'RepairEpisode + Worker' } }
  };
}

module.exports = { describeTypes, ORGANELLES, AUTHORITY };
