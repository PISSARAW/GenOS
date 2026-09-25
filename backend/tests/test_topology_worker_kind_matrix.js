'use strict';

const assert = require('node:assert/strict');
const biologicalModes = require('../src/services/biologicalModeService');
const topologyKinds = require('../src/services/topologyWorkerKindService');
const workerKinds = require('../src/services/agents/workerKindService');
const enforcement = require('../src/services/agents/workerContractEnforcement');
const phenotypes = require('../src/services/agents/phenotypeRegistryService');
const persistence = require('../src/services/topologyWorkerPersistenceService');
const trinity = require('../src/services/trinityService');
const { composeMode } = require('../src/services/biologicalTopologyService');
const biocenose = require('../src/services/biocenoseService');
const biome = require('../src/services/biomeCoordinationService');
const holobionte = require('../src/services/holobionteCoordinationService');
const metapopulation = require('../src/services/metapopulationCoordinationService');
const rhizome = require('../src/services/rhizomeCoordinationService');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function persistAndCheckWorker(mode, member, index) {
  const workerId = `${mode}-${index}`;
  let metadata;
  const db = {
    get: async () => null,
    run: async (_sql, ...values) => { metadata = JSON.parse(values.at(-1)); }
  };
  const created = await persistence.ensureTopologyWorker(db, {
    workerId, parentId: 'topology-orchestrator', role: member.role,
    workerKind: member.workerKind, mission: member.mission
  });
  assert.deepEqual(created, { workerId, created: true });
  assert.equal(metadata.workerKind, member.workerKind, `${mode}:${member.role} persisted the selected kind`);
  assert.equal(metadata.workerContract.identity.workerKind, member.workerKind);
  assert.deepEqual(metadata.workerContract.evidence.requiredArtifacts,
    [workerKinds.kindDefinition(member.workerKind).artifact]);
  assert.equal(enforcement.assertRuntimeContract(metadata.workerContract, member.workerKind), true);
  const definition = workerKinds.kindDefinition(member.workerKind);
  const profile = workerKinds.applyAuthorityOverrides(member.workerKind,
    phenotypes.getAuthorityProfile(definition.authorityPhenotype));
  for (const action of ['read', 'analyze', 'execute', 'write', 'promote']) {
    assert.equal(metadata.workerContract.authority[action], Boolean(profile[action]),
      `${member.workerKind} contract ${action} authority matches its phenotype`);
  }
  assert.equal(metadata.workerContract.authority.write, false, `${mode}:${member.role} must not gain write authority`);
  assert.equal(metadata.workerContract.authority.spawn, false);
  assert.equal(metadata.workerContract.authority.delegate, false);
  if (metadata.workerContract.authority.execute) {
    assert.equal(enforcement.assertWorkerToolAllowed(metadata.workerContract, 'genos_search_failures'), true);
  } else {
    assert.throws(() => enforcement.assertWorkerToolAllowed(metadata.workerContract, 'genos_search_failures'), {
      code: 'WORKER_CONTRACT_DENIED'
    });
  }
  assert.throws(() => enforcement.assertWorkerToolAllowed(metadata.workerContract, 'genos_execute_primitive'), {
    code: 'WORKER_CONTRACT_DENIED'
  });
  for (const tool of ['genos_create', 'genos_merge', 'genos_change_organization']) {
    assert.throws(() => enforcement.assertWorkerToolAllowed(metadata.workerContract, tool), {
      code: 'WORKER_CONTRACT_DENIED'
    });
  }
}

function verifyMappedTopology(mode, rawMembers) {
  const members = topologyKinds.applyTopologyWorkerKinds(mode, rawMembers);
  const expectedKinds = topologyKinds.MODE_ROLE_KINDS[mode];
  for (const member of members) {
    const expected = expectedKinds[member.role];
    assert.equal(member.workerKind, expected, `${mode}:${member.role} mapping`);
    assert.equal(member.executionMode, expected === null ? 'orchestrator' : 'worker');
    if (expected !== null) {
      assert.ok(member.workerKindReason, `${mode}:${member.role} includes its mapping reason`);
    }
  }
  return members;
}

async function verifyBiologicalBranches() {
  const modes = Object.keys(topologyKinds.MODE_ROLE_KINDS)
    .filter((mode) => !['a_team', 'trinity'].includes(mode));
  const services = [
    [biocenose, 'prepareCommunity'], [biome, 'composeBiome'],
    [holobionte, 'composeHolobiont'], [metapopulation, 'createMetapopulationSession'],
    [rhizome, 'composeRhizome'], [syncytium, 'createSession']
  ];
  const originals = services.map(([service, name]) => [service, name, service[name]]);
  try {
    for (const mode of modes) {
      const method = mode === 'biocenose' ? 'prepareCommunity'
        : mode === 'biome' ? 'composeBiome'
          : mode === 'holobionte' ? 'composeHolobiont'
            : mode === 'metapopulation' ? 'createMetapopulationSession'
              : mode === 'rhizome' ? 'composeRhizome' : 'createSession';
      const service = services.find((entry) => entry[1] === method)[0];
      service[method] = async () => ({
        members: biologicalModes.compose(mode, `Exercise the ${mode} topology mapping.`)
      });
      const composition = await composeMode({ mode, mission: `Exercise the ${mode} topology mapping.` });
      const members = verifyMappedTopology(mode, composition.members);
      for (const [index, member] of members.entries()) {
        if (member.workerKind) await persistAndCheckWorker(mode, member, index);
      }
    }
  } finally {
    for (const [service, name, original] of originals) service[name] = original;
  }
}

async function verifyProductTopologies() {
  const securityMission = 'Launch Trinity to secure OAuth permissions against token exploits.';
  assert.equal(trinity.analyzeMission(securityMission).recommended, true);
  const securityComposition = await composeMode({ mode: 'trinity', mission: securityMission });
  const trinityMembers = securityComposition.members;
  assert.deepEqual(trinityMembers.map((member) => member.workerKind), [
    'bounded_worker', 'specialist', 'adaptive_worker'
  ]);
  for (const [index, member] of trinityMembers.entries()) await persistAndCheckWorker('trinity', member, index);

  const creativeMission = 'Lance Trinity pour écrire une nouvelle littéraire dramatique.';
  assert.equal(trinity.analyzeMission(creativeMission).domain, 'creative_writing');
  const creativeComposition = await composeMode({ mode: 'trinity', mission: creativeMission });
  const creativeMembers = creativeComposition.members;
  assert.ok(creativeMembers.every((member) => member.workerKind === 'creative_worker'));
  for (const [index, member] of creativeMembers.entries()) await persistAndCheckWorker('trinity-creative', member, index);
  const teamComposition = await composeMode({
    mode: 'a-team', mission: 'Build a React interface and an Express API.'
  });
  const teamMembers = teamComposition.members;
  assert.ok(teamMembers.every((member) => member.workerKind));
  for (const [index, member] of teamMembers.entries()) await persistAndCheckWorker('a_team', member, index);

  const roleBranches = topologyKinds.applyTopologyWorkerKinds('a_team', [
    { role: 'security_reviewer' }, { role: 'integration_observer' },
    { role: 'literary_author' }, { role: 'api_specialist' }
  ]);
  assert.deepEqual(roleBranches.map((member) => member.workerKind), [
    'verifier_worker', 'synthesis_worker', 'creative_worker', 'specialist'
  ]);
  for (const [index, member] of roleBranches.entries()) await persistAndCheckWorker('a_team-roles', member, index);
}

async function verifyFailClosedCases() {
  assert.throws(() => topologyKinds.applyTopologyWorkerKinds('biome', [{ role: 'unmapped_role' }]), {
    code: 'TOPOLOGY_WORKER_KIND_MISSING'
  });
  assert.throws(() => topologyKinds.applyTopologyWorkerKinds('biome', [{ role: 'environment_mapper', workerKind: 'unknown_kind' }]), {
    code: 'TOPOLOGY_WORKER_KIND_UNKNOWN'
  });
  assert.throws(() => topologyKinds.applyTopologyWorkerKinds('biome', [{ role: 'environment_mapper', workerKind: 'bounded_worker' }]), {
    code: 'TOPOLOGY_WORKER_KIND_MISMATCH'
  });
  assert.throws(() => topologyKinds.applyTopologyWorkerKinds('trinity', [{ role: 'worker', chamber: 'unmapped' }]), {
    code: 'TOPOLOGY_WORKER_KIND_MISSING'
  });
  await assert.rejects(() => composeMode({ mode: 'unmapped_topology', mission: 'Unknown topology.' }), {
    code: 'BIOLOGICAL_MODE_UNKNOWN'
  });
}

async function run() {
  await verifyBiologicalBranches();
  await verifyProductTopologies();
  await verifyFailClosedCases();
  console.log('Topology worker kind matrix, persistence, contracts, and permissions: PASS');
}

run().catch((error) => { console.error(error); process.exit(1); });
