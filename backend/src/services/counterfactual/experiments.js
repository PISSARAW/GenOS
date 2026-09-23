'use strict';

const vfsSandboxService = require('../vfsSandboxService');

function buildProbes(type) {
  const base = [{ name: 'validate', command: 'echo validated' }];
  const probes = {
    strategy: [...base, { name: 'strategy_switch', command: 'echo strategy_applied' }],
    capability: [...base, { name: 'capability_check', command: 'echo capability_present' }],
    dna: [...base, { name: 'genome_mutation', command: 'echo mutation_applied' },
      { name: 'fitness_eval', command: 'echo fitness_computed' }],
    plasmid: [...base, { name: 'plasmid_integrate', command: 'echo plasmid_integrated' }],
    communication_policy: [...base, { name: 'policy_apply', command: 'echo policy_applied' }],
    relationship: [...base, { name: 'rebind_agent', command: 'echo rebind_complete' }],
    worker_allocation: [...base, { name: 'rebalance_workers', command: 'echo rebalance_complete' }],
  };
  return probes[type] || base;
}

async function runProbe(vfsNs, probe) {
  try {
    const result = await vfsSandboxService.executeSandboxed(vfsNs, probe.command, {
      mode: 'simulation',
    });
    return { name: probe.name, exitCode: result.success ? 0 : 1,
      durationMs: result.durationMs || 0 };
  } catch (err) {
    return { name: probe.name, exitCode: -1, stderr: err.message, durationMs: 0 };
  }
}

async function executeVfsExperiment(world) {
  const probes = buildProbes(world.counterfactual_type);
  const metrics = { worldId: world.id, counterfactualType: world.counterfactual_type,
    success: true, score: 0, violations: [], probes: [] };
  for (const probe of probes) {
    const r = await runProbe(world.vfs_namespace, probe);
    metrics.probes.push(r);
    if (r.exitCode !== 0) metrics.violations.push('probe_failed:' + probe.name);
  }
  const ok = metrics.probes.filter(p => p.exitCode === 0).length;
  metrics.score = probes.length > 0 ? ok / probes.length : 0;
  metrics.success = metrics.violations.length === 0;
  return metrics;
}

module.exports = { buildProbes, runProbe, executeVfsExperiment };
