'use strict';

const assert = require('node:assert/strict');
const { composeMode, normalizeMode } = require('../src/services/biologicalTopologyService');

async function verifyTrinityDispatch() {
  const result = await composeMode({ mode: 'trinity', mission: 'Compare three independent hypotheses using Pareto quality and cost.' });
  assert.equal(result.members.length, 3);
  assert.deepEqual(result.members.map((member) => member.worldNumber), [1, 2, 3]);
  assert.equal(result.variant, 'composed');
  assert.equal(result.variantSelection.method, 'mission_signals');
  assert.equal(result.variantSelection.experimentalDesign.objectivePolicy, 'pareto_orthogonal');
  const explicit = await composeMode({ mode: 'trinity', mission: 'Secure the API.', options: { variantId: 'adversarial' } });
  assert.equal(explicit.variant, 'adversarial');
  assert.match(explicit.members[2].mission, /challenge and correct/);
  assert.match(explicit.members[2].mission, /evidence/);
}

async function verifyATeamDispatch() {
  const result = await composeMode({ mode: 'a-team', mission: 'Build a React interface and an Express API.' });
  assert.ok(result.members.length >= 2);
  assert.ok(result.members.every((member) => member.mission.includes('Project goal:')));
  await assert.rejects(
    () => composeMode({ mode: 'a_team', mission: 'Solve one simple recurrence.' }),
    { code: 'A_TEAM_MULTIDISCIPLINARY_REQUIRED' }
  );
}

async function verifySyncytiumVariantDispatch() {
  const automatic = await composeMode({ mode: 'syncytium', mission: 'Refactor code and preserve regression tests.' });
  assert.equal(automatic.variantPolicy.id, 'code');
  assert.equal(automatic.variantSelection.method, 'mission_fit');
  assert.equal(automatic.variantPolicy.consistencyZones.files, 'INVARIANT_PRESERVING');
  const explicit = await composeMode({
    mode: 'syncytium', mission: 'Refactor code.', options: { variantId: 'graph' }
  });
  assert.equal(explicit.variantPolicy.id, 'graph');
  assert.equal(explicit.variantSelection.method, 'explicit');
  assert.deepEqual(Object.keys(explicit.schema.fields), ['graph_nodes', 'graph_edges']);
}

async function verifyRhizomeVariantDispatch() {
  const automatic = await composeMode({
    mode: 'rhizome', mission: 'Explore unknown dependencies and discover novel capability routes.'
  });
  assert.equal(automatic.variant, 'exploratory');
  assert.equal(automatic.variantSelection.method, 'mission_signals');
  assert.equal(automatic.variantPolicy.growth.threshold, 0);
  const explicit = await composeMode({
    mode: 'rhizome', mission: 'Explore unknown dependencies.', options: { variantId: 'growth' }
  });
  assert.equal(explicit.variant, 'growth');
  assert.equal(explicit.variantSelection.method, 'explicit');
  assert.equal(explicit.variantPolicy.routing.maxHops, 8);
}

async function verifyHolobionteVariantDispatch() {
  const automatic = await composeMode({ mode: 'holobionte', mission: 'Review security and reduce authentication risk.' });
  assert.equal(automatic.variant, 'immune-critical');
  assert.equal(automatic.variantSelection.source, 'mission_fit');
  assert.equal(automatic.variantPolicy.immune.requireIndependentVerifier, true);
  const explicit = await composeMode({
    mode: 'holobionte', mission: 'Review a task.',
    options: { variantId: 'memory-rich', configuration: { capabilities: ['persistent-memory'], localEngineAvailable: true } }
  });
  assert.equal(explicit.variant, 'memory-rich');
  assert.equal(explicit.variantSelection.source, 'explicit');
  assert.equal(explicit.variantPolicy.resources.memoryRetention, 'verified');
  assert.deepEqual(explicit.variantPolicy.memory.stores, ['semantic', 'episodic', 'procedural']);
  const edge = await composeMode({
    mode: 'holobionte', mission: 'Run with cloud host and edge symbionts.',
    options: { variantId: 'cloud-core/edge-symbionts', configuration: { capabilities: ['cloud-core', 'edge-symbionts'] } }
  });
  assert.equal(edge.variantPolicy.placement.symbionts, 'edge');
  assert.equal(edge.variantPolicy.admission.requireEdgeLease, true);
  const fallback = await composeMode({ mode: 'holobionte', mission: 'Use the tool API to execute an operation.' });
  assert.equal(fallback.variant, 'procedural');
  assert.deepEqual(fallback.variantSelection.rejected[0].missing, ['capability:tool-sandbox']);
  await assert.rejects(
    () => composeMode({ mode: 'holobionte', mission: 'Use a local-only workflow.', options: { variant: 'local-first' } }),
    { code: 'HOLOBIONT_VARIANT_INCOMPATIBLE' }
  );
  const local = await composeMode({
    mode: 'holobionte', mission: 'Use a local-only workflow.',
    options: { variantId: 'local-first', configuration: { localEngineAvailable: true } }
  });
  assert.equal(local.variant, 'local-first');
  await assert.rejects(
    () => composeMode({ mode: 'holobionte', mission: 'Use a tool API.', options: { variantId: 'tool' } }),
    { code: 'HOLOBIONT_VARIANT_INCOMPATIBLE' }
  );
}

async function run() {
  assert.equal(normalizeMode(' A-TEAM '), 'a_team');
  assert.equal(normalizeMode('holobiont'), 'holobionte');
  await verifyTrinityDispatch();
  await verifyATeamDispatch();
  await verifySyncytiumVariantDispatch();
  await verifyRhizomeVariantDispatch();
  await verifyHolobionteVariantDispatch();
  console.log('Biological topology dispatch checks: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
