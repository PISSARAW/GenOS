'use strict';

const assert = require('assert');
const { buildMissionCapabilityPlan } = require('../src/services/ontogenesis/missionCapabilityPlanService');
const { dispatchRefusal } = require('../src/services/ontogenesis/missionPreflightService');
const { requestFor } = require('../src/services/ontogenesis/runtimeHarness');
const { resolveConceptReferences } = require('../src/services/ontogenesis/canonicalConceptRegistry');

function baseInput(config) {
  return {
    project: { id: 'project-preflight' }, task: { id: 'task-preflight', acceptance_json: '[]' },
    selection: { topology: 'trinity', variant: 'default' }, config,
    mission: {
      capabilities: ['execute', 'verify'],
      capabilityCatalog: [
        { capability: 'EVIDENCE_BARRIER', state: 'partiel', level: 'partial' },
        { capability: 'PROMOTION_GATE', state: 'operationnel', level: 'full' }
      ], concepts: { operational: [], unavailable: [] },
      morphology: { selectedTopology: 'trinity', selectedOrganization: null }
    }
  };
}

const ready = buildMissionCapabilityPlan(baseInput({ availableCapabilities: ['execute', 'verify'] }));
assert.strictEqual(ready.preflight.version, 1);
assert.strictEqual(ready.preflight.execution.status, 'admitted');
assert.deepStrictEqual(ready.preflight.execution.required, ['execute', 'verify']);
assert.deepStrictEqual(ready.preflight.execution.missing, []);
assert.ok(ready.preflight.topology.notFullyOperational.includes('EVIDENCE_BARRIER'));
assert.ok(!ready.preflight.topology.operational.includes('EVIDENCE_BARRIER'));
assert.strictEqual(ready.preflight.status, 'admitted_with_gaps');
assert.deepStrictEqual(ready.preflight.blockingReasons, []);
assert.strictEqual(dispatchRefusal(ready.preflight), null);

const blocked = buildMissionCapabilityPlan(baseInput({ availableCapabilities: ['execute'] }));
assert.strictEqual(blocked.preflight.status, 'blocked');
assert.deepStrictEqual(blocked.preflight.blockingReasons, ['capacite-execution-manquante:verify']);
assert.strictEqual(dispatchRefusal(blocked.preflight), 'capacite-execution-manquante:verify');

const unverified = buildMissionCapabilityPlan(baseInput({}));
assert.strictEqual(unverified.preflight.execution.status, 'unverified');
assert.deepStrictEqual(unverified.preflight.blockingReasons, []);
assert.strictEqual(dispatchRefusal(unverified.preflight), 'capacites-execution-non-attestees');
assert.strictEqual(dispatchRefusal({ ...ready.preflight, execution: { status: 'unexpected' } }),
  'capacites-execution-non-admises');
assert.strictEqual(dispatchRefusal(null), 'preflight-mission-indisponible');

const invalid = baseInput({ availableCapabilities: ['execute', 'verify'] });
invalid.mission.morphology.error = 'topologie-configuree-inconnue';
assert.ok(buildMissionCapabilityPlan(invalid).preflight.blockingReasons.includes(
  'morphologie-invalide:topologie-configuree-inconnue'
));

const unknownConcept = baseInput({ availableCapabilities: ['execute', 'verify'] });
unknownConcept.mission.concepts.blockedConcepts = resolveConceptReferences(['inexistant'], 'trinity');
assert.ok(buildMissionCapabilityPlan(unknownConcept).preflight.blockingReasons.includes('concept-indisponible:inexistant'));

const philosophicalConcept = baseInput({ availableCapabilities: ['execute', 'verify'] });
philosophicalConcept.mission.concepts.resolvedConcepts = resolveConceptReferences(['epistemologie'], 'trinity');
philosophicalConcept.mission.concepts.blockedConcepts = philosophicalConcept.mission.concepts.resolvedConcepts;
const philosophicalPreflight = buildMissionCapabilityPlan(philosophicalConcept).preflight;
assert.deepStrictEqual(philosophicalPreflight.blockingReasons, []);
assert.ok(philosophicalPreflight.concepts.requiredEvidenceAtIntegration.some((reference) =>
  reference.id === 'epistemology.knowledge'
));

const unavailableCapability = baseInput({ availableCapabilities: ['execute', 'verify'] });
unavailableCapability.mission.concepts.resolvedConcepts = resolveConceptReferences(['EVIDENCE_BARRIER'], 'trinity');
unavailableCapability.mission.concepts.blockedConcepts = unavailableCapability.mission.concepts.resolvedConcepts;
const unavailableCapabilityPreflight = buildMissionCapabilityPlan(unavailableCapability).preflight;
assert.strictEqual(unavailableCapabilityPreflight.status, 'blocked');
assert.deepStrictEqual(unavailableCapabilityPreflight.blockingReasons,
  ['concept-indisponible:EVIDENCE_BARRIER']);
assert.strictEqual(dispatchRefusal(unavailableCapabilityPreflight), 'concept-indisponible:EVIDENCE_BARRIER');

const incompatibleGraphConcept = baseInput({ availableCapabilities: ['execute', 'verify'] });
incompatibleGraphConcept.mission.concepts.resolvedConcepts = resolveConceptReferences(['foveal_scan'], 'trinity');
incompatibleGraphConcept.mission.concepts.blockedConcepts = incompatibleGraphConcept.mission.concepts.resolvedConcepts;
const incompatibleGraphPreflight = buildMissionCapabilityPlan(incompatibleGraphConcept).preflight;
assert.deepStrictEqual(incompatibleGraphPreflight.concepts.blocking, ['foveal_scan']);
assert.strictEqual(dispatchRefusal(incompatibleGraphPreflight), 'concept-indisponible:foveal_scan');

const operationalCapability = baseInput({ availableCapabilities: ['execute', 'verify'] });
operationalCapability.mission.concepts.resolvedConcepts = resolveConceptReferences(['PROMOTION_GATE'], 'trinity');
operationalCapability.mission.concepts.blockedConcepts = [];
const operationalCapabilityPreflight = buildMissionCapabilityPlan(operationalCapability).preflight;
assert.deepStrictEqual(operationalCapabilityPreflight.blockingReasons, []);
assert.strictEqual(dispatchRefusal(operationalCapabilityPreflight), null);

const request = requestFor({ id: 'run-preflight', project: { id: 'p' }, task: { id: 't', title: 'run', acceptance_json: '[]' },
  selection: { topology: 'trinity', variant: 'default', workerRoles: [] }, worktree: 'C:/workspace',
  budgets: { seconds: 10, tokens: 1, usd: 0 }, config: {},
  mission: { ...baseInput({ availableCapabilities: ['execute', 'verify'] }).mission, plan: ready } });
assert.strictEqual(request.missionPreflight, ready.preflight);
assert.deepStrictEqual(request.existingCapabilities, ['execute', 'verify']);
assert.ok(request.topologyContract.required.includes('EVIDENCE_BARRIER'));
console.log('mission capability preflight contract checks passed.');
