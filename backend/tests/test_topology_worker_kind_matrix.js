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
  let assignment = member.workerAssignment;
  if (member.workerKind === 'symbiotic_worker' && !assignment.hostContractId) {
    await assert.rejects(persistence.ensureTopologyWorker(db, {
      workerId, parentId: 'topology-orchestrator', role: member.role,
      workerKind: member.workerKind, mission: member.mission, workerAssignment: assignment
    }), { code: 'SYMBIOTIC_HOST_CONTRACT_REQUIRED' });
    assignment = { ...assignment, hostContractId: 'fixture-host-contract', hostCapabilities: ['host_bound'] };
  }
  const created = await persistence.ensureTopologyWorker(db, {
    workerId, parentId: 'topology-orchestrator', role: member.role,
    workerKind: member.workerKind, mission: member.mission,
    methodContract: member.methodContract, workerAssignment: assignment
  });
  assert.deepEqual(created, { workerId, created: true });
  assert.equal(metadata.workerKind, member.workerKind, `${mode}:${member.role} persisted the selected kind`);
  assert.equal(metadata.workerContract.identity.workerKind, member.workerKind);
  if (member.workerKind === 'specialist') {
    assert.equal(metadata.workerContract.mission.specialtyNiche, member.workerAssignment.nicheDomain);
  }
  if (member.workerKind === 'symbiotic_worker') {
    assert.equal(metadata.workerContract.mission.hostContractId, assignment.hostContractId);
    assert.deepEqual(metadata.workerContract.mission.hostCapabilities, assignment.hostCapabilities);
  }
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
  if (metadata.workerContract.authority.read) {
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
  for (const member of members) {
    assert.equal(member.executionMode, member.workerKind ? 'worker' : 'orchestrator');
    if (member.workerKind) {
      assert.ok(member.workerKindReason, `${mode}:${member.role} includes its mapping reason`);
      assert.ok(member.workerAssignment.requiredCapabilities.every((capability) =>
        workerKinds.KIND_CAPABILITIES[member.workerKind].includes(capability)));
      assert.equal(member.workerAssignment.workerKind, member.workerKind);
    }
  }
  return members;
}

async function verifyBiologicalBranches() {
  const services = [
    ['biocenose', biocenose, 'prepareCommunity'], ['biome', biome, 'composeBiome'],
    ['holobionte', holobionte, 'composeHolobiont'], ['metapopulation', metapopulation, 'createMetapopulationSession'],
    ['rhizome', rhizome, 'composeRhizome'], ['syncytium', syncytium, 'createSession']
  ];
  const originals = services.map(([, service, name]) => [service, name, service[name]]);
  try {
    for (const [mode, service, method] of services) {
      service[method] = async () => ({
        members: biologicalModes.compose(mode, mode === 'syncytium'
          ? 'Maintain a shared graph of nodes and edges.'
          : `Exercise the ${mode} topology mapping.`)
      });
      const mission = mode === 'syncytium'
        ? 'Maintain a shared graph of nodes and edges.'
        : `Exercise the ${mode} topology mapping.`;
      const composition = await composeMode({ mode, mission });
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
  const [hostedSymbiont] = topologyKinds.applyTopologyWorkerKinds('holobionte', [{
    role: 'specialist_symbiont', mission: 'Contribute within the Host contract.',
    hostContractId: 'host-contract-1', hostCapabilities: ['host_bound'], hostId: 'host-1'
  }]);
  assert.equal(hostedSymbiont.workerAssignment.hostContractId, 'host-contract-1');
  assert.deepEqual(hostedSymbiont.workerAssignment.hostCapabilities, ['host_bound']);
  assert.equal(hostedSymbiont.workerAssignment.hostId, 'host-1');
  const securityMission = 'Launch Trinity to secure OAuth permissions against token exploits.';
  assert.equal(trinity.analyzeMission(securityMission).recommended, true);
  const securityComposition = await composeMode({ mode: 'trinity', mission: securityMission });
  const trinityMembers = securityComposition.members;
  assert.deepEqual(trinityMembers.map((member) => member.workerKind), [
    'bounded_worker', 'specialist', 'red_worker'
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
    code: 'WORKER_KIND_CAPABILITY_MISMATCH'
  });
  assert.throws(() => topologyKinds.applyTopologyWorkerKinds('trinity', [{ role: 'worker', chamber: 'unmapped' }]), {
    code: 'TOPOLOGY_WORKER_KIND_MISSING'
  });
  await assert.rejects(() => composeMode({ mode: 'unmapped_topology', mission: 'Unknown topology.' }), {
    code: 'BIOLOGICAL_MODE_UNKNOWN'
  });
}

function verifyMethodContractsSelectSpecialists() {
  const cases = [
    ['implementation', 'evolutionary_search', 'adaptive_worker'],
    ['implementation', 'experimental_design', 'experimental_worker'],
    ['adversarial_reviewer', 'threat_modeling', 'red_worker'],
    ['analyst', 'causal_analysis', 'forensic_worker'],
    ['recovery_specialist', 'recolonization', 'recovery_worker'],
    ['integration_observer', 'synthesis', 'synthesis_worker'],
    ['literary_author', 'creative_writing', 'creative_worker']
  ];
  for (const [role, methodId, expectedKind] of cases) {
    const [member] = topologyKinds.applyTopologyWorkerKinds('method-fit', [{
      role, methodContract: { version: 1, methodId }
    }]);
    assert.equal(member.workerKind, expectedKind, `${role}/${methodId} selects ${expectedKind}`);
  }
  for (const methodId of ['dynamic_programming']) {
    assert.throws(() => topologyKinds.applyTopologyWorkerKinds('method-fit', [{
      role: 'implementation', methodContract: { version: 1, methodId }
    }]), { code: 'WORKER_EXECUTOR_UNAVAILABLE' });
  }
  assert.throws(() => topologyKinds.applyTopologyWorkerKinds('method-fit', [{
    role: 'implementation', methodContract: { version: 1, methodId: 'formal_proof' }
  }]), { code: 'WORKER_FORMAL_INPUT_INVALID' });
  assert.throws(() => topologyKinds.applyTopologyWorkerKinds('method-fit', [{
    role: 'implementation', methodContract: { version: 1, methodId: 'unregistered_method' }
  }]), { code: 'WORKER_METHOD_UNSUPPORTED' });
  assert.throws(() => topologyKinds.applyTopologyWorkerKinds('method-fit', [{
    role: 'implementation', workerKind: 'bounded_worker',
    methodContract: { version: 1, methodId: 'formal_proof' }
  }]), { code: 'WORKER_KIND_CAPABILITY_MISMATCH' });
}

async function run() {
  await verifyBiologicalBranches();
  await verifyProductTopologies();
  await verifyFailClosedCases();
  verifyMethodContractsSelectSpecialists();
  console.log('Topology worker kind matrix, persistence, contracts, and permissions: PASS');
}

run().catch((error) => { console.error(error); process.exit(1); });
