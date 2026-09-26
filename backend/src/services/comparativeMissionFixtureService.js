'use strict';

const path = require('path');
const { validateComparativeMission } = require('./comparativeMissionContract');

const FIXTURE_IDS = Object.freeze(['level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6']);
const FIXTURE_ROOT = path.resolve(__dirname, '../../fixtures/comparative-missions');
const SUBMISSION_GUIDANCE = Object.freeze({
  'two-machine-scheduling': 'submission: provide task assignments, durations and reported makespan; include a readable answer string for independent recomputation.',
  'constraint-checklist': 'Return a JSON object in your first claim statement with submission.environments.<your population id> = {checks:{list:true,add:true,complete:true,offline:true,persistence:true,local-fitness:true},evidenceRefs:["design:<specific local decision>"]}. Describe a design only; do not claim an implementation test.',
  'parser-contract': 'Return a JSON object in your first claim statement with submission.parserSource and submission.testMatrix. This fixture remains unverified until an isolated code runner is available.',
  'bin-packing': 'Return a JSON object in your first claim statement with submission.bins as an array of {id,items:[{id,weight}]}; include every fixture item exactly once and stay within capacity.',
  'synthetic-finding-validation': 'Return a JSON object in your first claim statement with submission.findings as an array of {id,evidenceRef}; use the known finding ids and quote the matching passage verbatim from the supplied pseudo-system.',
  'collapse-recolonization': 'Return a JSON object in your first claim statement with submission.collapse={populationId:"greedy",initialSelection:["A"]}, submission.recolonization={founderLineages:[two distinct supplied lineage names],projects:[a viable project],neighborProjects:[a different viable project]}, and submission.continuingPopulations=[{populationId,projects}] for each of the three survivors.'
});

function loadFixture(id) {
  if (!FIXTURE_IDS.includes(id)) {
    throw Object.assign(new Error(`Unknown comparative mission fixture '${id}'.`), { code: 'COMPARATIVE_FIXTURE_NOT_FOUND' });
  }
  const fixture = require(path.join(FIXTURE_ROOT, `${id}.json`));
  return validateComparativeMission(fixture);
}

function renderFixtureMission(fixture) {
  validateComparativeMission(fixture);
  const lines = [
    `Comparative mission fixture ${fixture.missionId}.`,
    `This fixture runs ${fixture.populations.length === 3 ? 'three' : 'four'} populations.`,
    'Solve the shared problem independently using each population method specified below.',
    'Treat problem.inputs as the complete source of truth. Do not invent missing data.',
    'Return concrete findings, calculations, local fitness, evidence and transferableIdeas.',
    'Transfer only bounded techniques or counterexamples, never a complete peer solution.',
    'A receiving population must locally test each imported idea before accepting it.',
    `Problem: ${JSON.stringify(fixture.problem)}`,
    `Populations: ${JSON.stringify(fixture.populations)}`,
    `Migration policy: ${JSON.stringify(fixture.migration)}`,
    `Evaluation contract: ${JSON.stringify(fixture.evaluation)}`,
    `Required submission: ${SUBMISSION_GUIDANCE[fixture.evaluation.kind] || 'Provide a structured submission.'}`
  ];
  if (fixture.evaluation.kind === 'two-machine-scheduling') {
    const tasks = Object.entries(fixture.problem.inputs.jobs).map(([name, duration]) => `${name}=${duration}`).join(', ');
    lines.push(`Scheduling instance: ${tasks}; two machines; minimize makespan.`);
  }
  return lines.join('\n');
}

module.exports = { FIXTURE_IDS, loadFixture, renderFixtureMission };
