'use strict';

const assert = require('assert');
const { listSensors, sensorsFor } = require('../src/services/perception/sensorRegistryService');
const { createSensorium, recordObservation } = require('../src/services/perception/sensoriumService');
const { makeObservation } = require('../src/services/perception/observationService');
const { selectFocus } = require('../src/services/perception/attentionResolverService');
const { resolveAffordances } = require('../src/services/perception/affordanceResolverService');
const { planProbes } = require('../src/services/perception/activePerceptionPlannerService');
const { getMetabolic, setMetabolic } = require('../src/services/metabolism/metabolicStateService');
const { decide } = require('../src/services/metabolism/resourceAllocatorService');
const { morphologyHint } = require('../src/services/metabolism/metabolicPressureService');
const { getResilience, transition } = require('../src/services/resilience/resilienceStateService');
const { getEnvelope } = require('../src/services/resilience/resilienceEnvelopeService');
const { planRecovery } = require('../src/services/resilience/recoveryPlannerService');
const { getDevelopmental } = require('../src/services/development/developmentalStateService');
const { differentiate } = require('../src/services/development/differentiationResolverService');
const { applyMarks } = require('../src/services/development/epigeneticExpressionService');
const { attach, forHost } = require('../src/services/proceduralSymbiont/symbiontService');
const { resolveProcedural } = require('../src/services/proceduralSymbiont/proceduralResolverService');
const { extendPlan } = require('../src/services/morphogenesis/morphogenesisPlanExtensions');

function main() {
  let pass = 0;
  let fail = 0;
  const t = (name, fn) => {
    try {
      fn();
      pass += 1;
      console.log(`ok - ${name}`);
    } catch (e) {
      fail += 1;
      console.error(`FAIL - ${name}: ${e.message}`);
    }
  };

  t('sensor registry lists 9 sensors', () => assert.strictEqual(listSensors().length, 9));
  t('sensorsFor filters by capability', () => assert.ok(sensorsFor({ capabilities: ['read'] }).length > 0));
  t('sensorium + observation loop', () => {
    createSensorium({ agentId: 'a1', sensors: ['filesystem'] });
    const obs = makeObservation({ sensorId: 'filesystem', agentId: 'a1', target: 'auth middleware', data: { file: 'x' } });
    recordObservation({ agentId: 'a1', observation: obs });
  });
  t('attention selects under budget', () => {
    const r = selectFocus({ candidates: [{ sensorId: 'test', expectedGain: 0.9 }, { sensorId: 'filesystem', expectedGain: 0.5 }], budget: 6 });
    assert.ok(r.selected.length >= 1);
  });
  t('affordance never invents file edit without authority', () => {
    const obs = makeObservation({ sensorId: 'filesystem', target: 'auth', data: { note: 'auth latency' } });
    const affs = resolveAffordances({ observation: obs, authority: { allowFileEdits: false } });
    assert.ok(!affs.some((a) => a.action === 'fork_patch'));
  });
  t('active perception plans probes', () => {
    const p = planProbes({ unknowns: [{ topic: 'latency', severity: 'high' }], capabilities: ['read', 'execute'], budget: 10 });
    assert.ok(p.probes.length > 0);
  });
  t('metabolic decide grants', () => {
    setMetabolic({ scopeId: 'worker:a1', patch: { tokenBudget: 1000 } });
    assert.strictEqual(getMetabolic('worker:a1').tokenBudget, 1000);
    const d = decide({ request: { tokens: 100, expectedInformationGain: 0.8, relevance: 0.9, urgency: 0.9, expectedProgress: 0.8, cost: 10 }, free: 500 });
    assert.strictEqual(d.verdict, 'GRANT');
  });
  t('pressure hint cryptobiosis when critical', () => {
    assert.strictEqual(morphologyHint({ remaining: 5, total: 100 }).hint, 'cryptobiosis');
  });
  t('resilience machine transitions', () => {
    assert.strictEqual(getResilience('a1').state, 'HEALTHY');
    assert.ok(transition({ agentId: 'a1', to: 'DEGRADED' }).ok);
    assert.ok(!transition({ agentId: 'a1', to: 'HEALTHY' }).ok);
    assert.ok(getEnvelope('a1').cryptobiosisAllowed);
  });
  t('recovery planner contains before morphogenesis', () => {
    const p = planRecovery({ error: 'worker crash exit 1' });
    assert.strictEqual(p.steps[0].step, 'contain');
  });
  t('development differentiates without DNA edit', () => {
    assert.strictEqual(getDevelopmental('a1').stage, 'PLURIPOTENT');
    const s = differentiate({ agentId: 'a1', niche: 'rust concurrency' });
    assert.strictEqual(s.stage, 'SPECIALIZED');
  });
  t('epigenetics never creates permission', () => {
    const r = applyMarks({ allowedCapabilities: ['read'], marks: [{ action: 'express', capability: 'gpu' }] });
    assert.strictEqual(r.refused.length, 1);
  });
  t('procedural symbiont authority intersection', () => {
    attach({ hostAgentId: 'a1', organismId: 'proc-diag' });
    assert.strictEqual(forHost('a1').length, 1);
    const r = resolveProcedural({ niche: 'diag', hostAuthority: ['read'], lease: ['read'], candidates: [{ id: 'p1', fitness: 0.9, requires: ['read'] }] });
    assert.ok(r.best);
  });
  t('morphogenesis plan extended to 14 dims + receipt', () => {
    const plan = extendPlan({ plan: { topologyChanges: [] }, reason: 'test' });
    assert.ok(plan.receipt && plan.receipt.hash);
    assert.ok(Array.isArray(plan.resourceAllocations));
  });

  console.log(`\n6-10 systems: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
