'use strict';

/**
 * Controlled module-level ablation for Natural Search phases 6–12.
 * This measures phase artifacts, not downstream mission-solving efficacy:
 * planningGapPolicies does not consume these artifacts as search actions.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ActuatorModules } = require('../../src/services/search/actuatorModules');
const { NaturalSearchActuator } = require('../../src/services/search/naturalSearchActuatorService');

const PHASES = [6, 7, 8, 9, 10, 11, 12];
const SEEDS = [7, 41, 43, 77, 101, 137, 202, 313];
const PHASE_NAMES = {
  6: 'hypermutation', 7: 'affinity', 8: 'foraging', 9: 'causal-replay',
  10: 'negative-memory', 11: 'evolution', 12: 'culture',
};

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function phaseSeed(seed, phase) {
  return (seed ^ Math.imul(phase, 0x9e3779b1)) >>> 0;
}

async function runStage(phase, seed, enabled) {
  if (!enabled) return null;
  const originalRandom = Math.random;
  Math.random = seededRandom(phaseSeed(seed, phase));
  try {
    return await executeStage(phase);
  } finally {
    Math.random = originalRandom;
  }
}

async function executeStage(phase) {
  const modules = new ActuatorModules({ genome: {
    id: 'seeded-genome', hypothesisFamily: 'cache', strategy: 'causal-debugging',
    operators: ['grep', 'test'], topology: 'isolated', evidencePolicy: 'artifact-hash',
    exploration: { radius: 0.18, noveltyWeight: 0.12 }, memory: { negativeTrails: true },
    mutations: [],
  }, emit: () => {} });
  const actuator = new NaturalSearchActuator({ modules, ledger: modules.ledger });
  if (phase === 6) return runHypermutation(modules);
  if (phase === 7) return runAffinity(modules);
  if (phase === 8) return runForaging(actuator);
  if (phase === 9) return runReplay(modules);
  if (phase === 10) return runNegativeMemory(modules);
  if (phase === 11) return runEvolution(modules);
  return runCulture(modules);
}

function runHypermutation(modules) {
  const result = modules.mutateGenome('minimal');
  return { radius: 'minimal', changes: result.mutations.map(item => ({
    target: item.target, changed: item.oldVal !== item.newVal,
  })) };
}

function runAffinity(modules) {
  const variants = modules.createAffinityVariants(null, 4, 'minimal');
  const best = modules.selectAffinityVariant(variants, 'agent-a');
  return { count: variants.length, selected: variants.some(v => v.id === best?.id) };
}

async function runForaging(actuator) {
  const receipt = await actuator.forage({ agentId: 'agent-a', infoGain: 0.2, elapsedTimeSec: 1 });
  return { status: receipt.status, action: receipt.action, visits: receipt.result?.visits,
    infoGain: receipt.result?.infoGain };
}

async function runReplay(modules) {
  const result = await modules.replayCausalEvents('agent-a', { id: 'h1', statement: 'test' }, [
    { action: 'inspect' }, { action: 'checkpoint', isCheckpoint: true }, { action: 'test' },
  ]);
  const replay = result.receipt.result;
  return { action: result.receipt.action, checkpoints: replay.checkpointCount,
    restorePoint: replay.restorePoint, stateRestored: replay.stateRestored };
}

function runNegativeMemory(modules) {
  const trail = modules.recordNegativeOutcome('agent-a', { id: 'h1', statement: 'bad route' },
    { ref: 'synthetic-counterexample', strength: 0.8, reliability: 0.9 },
    { signature: 'maze-a', conditions: ['key-locked'], scope: 'agent' });
  return { trail: { statement: trail.statement, scope: trail.scope, active: trail.active,
    createdAt: trail.createdAt, ttl: trail.ttl }, now: Date.now() };
}

function runEvolution(modules) {
  const result = modules.evolveSearchPopulation({ successfulFamilies: ['cache'],
    failedFamilies: ['timing'], recommendedStrategies: ['causal-debugging'] });
  return { generation: result.generation, population: modules.searchGenome.population.length,
    finiteFitness: Number.isFinite(result.bestFitness) };
}

function runCulture(modules) {
  const genome = modules.searchGenome.genome;
  const validation = { environment: 'synthetic', generations: 2, successRate: 1,
    reproducible: true, evidenceRefs: ['seed-run-a', 'seed-run-b'], genomeId: genome.id };
  const plasmid = modules.compilePlasmid(genome, validation);
  const transmission = modules.transmitPlasmid(plasmid.id, 'agent-b');
  const received = modules.cultureService.receive({ plasmid, transmission, sourceAgentId: 'agent-a' }, 'agent-b');
  return { compiled: Boolean(plasmid), transmitted: Boolean(transmission), received,
    target: transmission?.targetAgentId || null };
}

const ARTIFACT_VERIFIERS = {
  6: artifact => artifact.radius === 'minimal' && artifact.changes.length === 1 &&
    artifact.changes.every(change => change.changed),
  7: artifact => artifact.count === 4 && artifact.selected,
  8: artifact => artifact.status === 'success' && artifact.visits === 1 &&
    artifact.infoGain === 0.2 && artifact.action === 'PATCH_DEPARTURE',
  9: artifact => artifact.action === 'REPLAY_ANALYZED' && artifact.checkpoints === 2 &&
    artifact.restorePoint === 'checkpoint_0' && artifact.stateRestored === false,
  10: artifact => artifact.trail.active && artifact.trail.statement === 'bad route' &&
    artifact.trail.scope === 'agent' && artifact.trail.ttl > 0 &&
    artifact.now < artifact.trail.createdAt + artifact.trail.ttl,
  11: artifact => artifact.generation === 1 && artifact.population === 6 && artifact.finiteFitness,
  12: artifact => artifact.compiled && artifact.transmitted && artifact.received && artifact.target === 'agent-b',
};

function verifyArtifact(phase, artifact) {
  return Boolean(ARTIFACT_VERIFIERS[phase]?.(artifact));
}

async function runArm(seed, ablatedPhase) {
  const rows = [];
  for (const phase of PHASES) {
    const artifact = await runStage(phase, seed, phase !== ablatedPhase);
    const verified = artifact === null ? phase === ablatedPhase : verifyArtifact(phase, artifact);
    assert.equal(verified, true, `seed=${seed}, phase=${phase}, ablated=${phase === ablatedPhase}`);
    rows.push({ phase, name: PHASE_NAMES[phase], enabled: phase !== ablatedPhase,
      artifact, independentlyVerified: verified });
  }
  return { seed, ablatedPhase, budgetSlots: PHASES.length, rows };
}

async function runCampaign() {
  const arms = [];
  for (const seed of SEEDS) {
    arms.push(await runArm(seed, null));
    for (const phase of PHASES) arms.push(await runArm(seed, phase));
  }
  const results = summarize(arms);
  const artifactDir = path.join(__dirname, '..', 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, 'natural-search-phase-ablation.json');
  fs.writeFileSync(artifactPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({ artifactPath, seeds: SEEDS.length, arms: arms.length,
    fixedSlotsPerArm: PHASES.length, phases: results.phaseEffects }, null, 2));
  return results;
}

function summarize(arms) {
  const full = arms.filter(arm => arm.ablatedPhase === null);
  const ablated = arms.filter(arm => arm.ablatedPhase !== null);
  const phaseEffects = PHASES.map(phase => {
    const enabledCount = full.reduce((n, arm) => n + Number(arm.rows[phase - 6].independentlyVerified), 0);
    const disabledCount = ablated.filter(arm => arm.ablatedPhase === phase)
      .reduce((n, arm) => n + Number(!arm.rows[phase - 6].enabled && arm.rows[phase - 6].artifact === null), 0);
    return { phase, name: PHASE_NAMES[phase], fullVerified: enabledCount,
      fullTrials: full.length, ablatedAbsent: disabledCount, ablatedTrials: SEEDS.length };
  });
  return { scope: 'synthetic module artifacts only; no mission-solve efficacy inference',
    seeds: SEEDS, fixedSlotsPerArm: PHASES.length, arms, phaseEffects };
}

if (require.main === module) {
  runCampaign().catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { runCampaign, verifyArtifact, PHASES, SEEDS };
