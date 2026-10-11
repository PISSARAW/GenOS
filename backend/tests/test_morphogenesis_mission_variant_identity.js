'use strict';

const assert = require('node:assert/strict');
const { MorphogenesisRuntime } = require('../src/services/morphogenesis/morphogenesisRuntime');
const { buildMorphogenesisEvent } = require('../src/services/morphogenesis/morphogenesisTelemetryService');

async function main() {
  const events = [];
  const runtime = new MorphogenesisRuntime({ emit: (...args) => events.push(args) });
  const contract = { selected_strategy: { primary: 'deterministic_direct_path' }, profile: {} };
  const morphology = await runtime.prepareMorphology(contract, {
    topologyId: 'trinity', variantId: 'controlled', mission: 'verify an implementation'
  });
  assert.equal(morphology.topology, 'trinity');
  assert.equal(morphology.variantId, 'controlled');
  assert.equal(morphology.topologyProfile.selectedVariant, 'controlled');
  const result = await runtime.executeMorphology(morphology, { orchestratorId: 'mission-1' });
  assert.equal(result.proposed, true);
  assert.equal(result.applied, false);
  assert.equal(result.variantId, 'controlled');
  assert.equal(buildMorphogenesisEvent(result, 'mission-1').payload.variantId, 'controlled');
  assert.equal(events[0][1], 'MORPHOGENESIS_PROPOSED');

  const team = await runtime.prepareMorphology(contract, { topologyId: 'a_team', variantId: 'project_dag' });
  assert.equal(team.topology, 'a_team');
  assert.equal(team.variantId, 'project_dag');
  await assert.rejects(runtime.prepareMorphology(contract, { topologyId: 'trinity', variantId: 'unknown' }), /Invalid topology profile/);
  await assert.rejects(runtime.prepareMorphology(contract, { topologyId: 'unknown' }), /Unknown requested topology/);
  await assert.rejects(runtime.prepareMorphology(contract, { variantId: 'controlled' }), /requires a registered topology/);
  const catalog = require('../../shared/toolDefinitions.json');
  const orchestration = catalog.tools.find((tool) => tool.name === 'genos_orchestrate');
  assert.equal(orchestration.inputSchema.properties.topologyId.type, 'string');
  assert.equal(orchestration.inputSchema.properties.variantId.type, 'string');
  console.log('Morphogenesis mission variant identity: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
