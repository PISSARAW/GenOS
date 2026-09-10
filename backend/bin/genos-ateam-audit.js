#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { analyzeMission } = require('../src/services/aTeamService');
const { evaluateQualityGate, buildEvidence } = require('../src/services/aTeamQualityGateService');

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function readMission(args) {
  const missionFile = argumentValue(args, '--mission-file');
  if (missionFile) return fs.readFileSync(path.resolve(missionFile), 'utf8');
  return argumentValue(args, '--mission') || process.env.GENOS_ATEAM_MISSION || '';
}

function main(argv = process.argv.slice(2)) {
  const mission = readMission(argv);
  if (!mission.trim()) throw new Error('A mission is required via --mission, --mission-file, or GENOS_ATEAM_MISSION.');
  const observerFile = argumentValue(argv, '--observer-report') || process.env.GENOS_ATEAM_OBSERVER_REPORT;
  const observerReport = observerFile ? readJson(observerFile) : null;
  const analysis = analyzeMission(mission);
  const gate = evaluateQualityGate(analysis, observerReport);
  const evidence = buildEvidence({ mission, analysis, gate, observerReport });
  const output = argumentValue(argv, '--evidence') || 'evidence.json';
  fs.writeFileSync(path.resolve(output), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ status: evidence.status, coverage: gate.coverage.ratio, evidence: output }));
  return gate.passed ? 0 : 2;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[genos-ateam-audit] ${error.message}`);
    process.exitCode = 2;
  }
}

module.exports = { argumentValue, readMission, main };