'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { observation } = require('../../src/services/nervous/contract');
const physiology = require('../../src/services/nervous/physiology');
const { compileGraph, propagation, LIMITS } = require('../../src/services/nervous/propagation');
const { NOW, SCOPE, event } = require('./helpers');

function signal(id, options = {}) { return observation(event(id, options), { scope: SCOPE, now: NOW }); }
function pressure(id, value) { return signal(id, { payload: { resourcePressure: value } }); }

test('sensory envelope removes prompts, secrets, tool output and unchecked success claims', () => {
  const value = signal('secret-test', { eventType: 'EVIDENCE_REPORT', detail: 'TOP_SECRET',
    payload: { prompt: 'TOP_SECRET', apiKey: 'TOP_SECRET', toolOutput: 'TOP_SECRET',
      evidenceReport: { outcome: 'success', verified: true, content: 'TOP_SECRET' } } });
  assert.equal(JSON.stringify(value).includes('TOP_SECRET'), false);
  assert.equal(value.reportedOutcome, 'success');
  assert.equal(value.verified, undefined);
  assert.ok(Object.isFrozen(value));
});

test('tenant scope must be explicit and match the event; invalid sensor values fail closed', () => {
  assert.throws(() => observation(event('a'), { scope: {}, now: NOW }));
  assert.throws(() => signal('a', { payload: { organizationId: 'other' } }), /SCOPE_MISMATCH/);
  for (const value of [NaN, Infinity, -0.1, 1.1, '0.5']) {
    assert.throws(() => pressure('bad', value), TypeError);
  }
});

test('unknown events and nervous outputs are not recursively ingested', () => {
  assert.equal(signal('internal', { eventType: 'NERVOUS_DECISION' }), null);
});

test('future timestamps rejected and legacy trace ids not presented as W3C traces', () => {
  assert.throws(() => signal('future', { timestamp: new Date(NOW + 60001).toISOString() }));
  assert.equal(signal('legacy', { payload: { traceId: 'trace-run-42' } }).correlation.traceId, undefined);
  assert.equal(signal('w3c', { payload: { traceId: 'a'.repeat(32) } }).correlation.traceId, 'a'.repeat(32));
  assert.equal(signal('zero', { payload: { traceId: '0'.repeat(32) } }).correlation.traceId, undefined);
});

test('three measured low-pressure samples establish rest, not one successful task', () => {
  let state = physiology.advance(null, signal('complete', { eventType: 'AGENT_COMPLETED' }), NOW).state;
  assert.equal(state.mode, 'UNKNOWN');
  for (let i = 0; i < 3; i += 1) state = physiology.advance(state, pressure(`p${i}`, 0.2), NOW).state;
  assert.equal(state.mode, 'REST');
});

test('hysteresis prevents high/low flapping and requires sustained recovery', () => {
  let state = physiology.advance(null, pressure('high', 0.9), NOW).state;
  assert.equal(state.mode, 'ALERT');
  state = physiology.advance(state, pressure('middle', 0.6), NOW).state;
  assert.equal(state.mode, 'ALERT');
  state = physiology.advance(state, pressure('low-1', 0.2), NOW).state;
  assert.equal(state.mode, 'RECOVERY');
  state = physiology.advance(state, pressure('middle-2', 0.5), NOW).state;
  assert.equal(state.healthySamples, 0);
  for (let i = 0; i < 3; i += 1) state = physiology.advance(state, pressure(`low-${i}`, 0.2), NOW).state;
  assert.equal(state.mode, 'REST');
});

test('refractory filtering never hides urgent nociceptive events', () => {
  const first = physiology.advance(null, signal('alarm-1', { eventType: 'AGENT_FAILED' }), NOW);
  const second = physiology.advance(first.state, signal('alarm-2', { eventType: 'AGENT_FAILED' }), NOW + 1);
  assert.equal(second.urgent, true);
  assert.ok(second.actions.includes('INHIBIT_DISPATCH'));
  assert.ok(second.actions.includes('NOTIFY_OPERATOR'));
});

test('noncritical repeated sensor alerts are habituated without dropping observations', () => {
  const first = physiology.advance(null, signal('blind-1', { payload: { observabilityCoverage: 0.4 } }), NOW);
  const second = physiology.advance(first.state, signal('blind-2', { payload: { observabilityCoverage: 0.4 } }), NOW + 1);
  assert.equal(first.actions.length, 1);
  assert.equal(second.disposition, 'HABITUATED');
  assert.equal(second.actions.length, 0);
  assert.equal(second.state.repetitions, 2);
});

test('priming is bounded, decays, and never grants an execution capability', () => {
  let state = null;
  for (let i = 0; i < 10; i += 1) state = physiology.advance(state, signal(`a-${i}`, { eventType: 'AGENT_FAILED' }), NOW).state;
  assert.equal(state.priming, 0.2);
  assert.equal(physiology.view(state, NOW + physiology.PRIME_MS).priming, 0);
  assert.equal(state.capability, undefined);
});

test('missing and expired sensors mean unknown, not healthy coverage', () => {
  assert.equal(physiology.view(null, NOW).uncertainty, 1);
  const value = signal('seen', { payload: { observabilityCoverage: 1, resourcePressure: 0.2 } });
  const state = physiology.advance(null, value, NOW).state;
  assert.equal(physiology.view(state, NOW).uncertainty, 0);
  assert.equal(physiology.view(state, NOW + 30001).observability, 'UNKNOWN');
  assert.equal(physiology.view(state, NOW + 30001).pressure, null);
});

test('historical replay and older samples cannot trigger a fresh reflex or overwrite state', () => {
  const first = physiology.advance(null, pressure('current', 0.9), NOW);
  const historical = physiology.advance(first.state, pressure('old', 0.1), NOW + 30001);
  assert.equal(historical.disposition, 'HISTORICAL');
  assert.deepEqual(historical.state, first.state);
  const late = signal('late', { timestamp: new Date(NOW - 1).toISOString() });
  assert.equal(physiology.advance(first.state, late, NOW).actions.length, 0);
});

test('plant-inspired wave is cycle-safe, bounded and expires', () => {
  const nodes = Array.from({ length: 100 }, (_, i) => ({ id: i === 0 ? 'worker-a' : `n${i}`, scope: SCOPE }));
  const edges = nodes.flatMap(node => nodes.slice(0, 5).map(target => ({ from: node.id, to: target.id })));
  const graph = compileGraph({ nodes, edges }, SCOPE);
  const item = signal('wave', { eventType: 'AGENT_FAILED' });
  const deliveries = propagation(graph, item, NOW);
  assert.equal(new Set(deliveries.map(value => value.nodeId)).size, deliveries.length);
  assert.ok(deliveries.every(value => value.hop <= LIMITS.hops && value.amplitude < 1));
  assert.ok(deliveries.length <= LIMITS.deliveries);
  assert.deepEqual(propagation(graph, item, NOW + LIMITS.ttl), []);
});

test('propagation graph rejects other tenants, unknown edges and duplicate nodes', () => {
  assert.throws(() => compileGraph({ nodes: [{ id: 'a', scope: { ...SCOPE, projectId: 'other' } }] }, SCOPE), /CROSS_TENANT/);
  assert.throws(() => compileGraph({ edges: [{ from: 'a', to: 'b' }] }, SCOPE), /UNKNOWN_GRAPH_NODE/);
  assert.throws(() => compileGraph({ nodes: [{ id: 'a', scope: SCOPE }, { id: 'a', scope: SCOPE }] }, SCOPE), /DUPLICATE_NODE/);
});

test('a fresh nociceptive alert remains visible even without pressure sensors', () => {
  const state = physiology.advance(null, signal('alert', { eventType: 'AGENT_FAILED' }), NOW).state;
  assert.equal(physiology.view(state, NOW).mode, 'ALERT');
  assert.equal(physiology.view(state, NOW).observability, 'UNKNOWN');
  assert.equal(physiology.view(state, NOW + 30001).mode, 'UNKNOWN');
});

test('a branching graph reaches but never exceeds the delivery budget', () => {
  const nodes = Array.from({ length: 128 }, (_, i) => ({ id: i === 0 ? 'worker-a' : `n${i}`, scope: SCOPE }));
  const edges = nodes.slice(1).map((node, i) => ({ from: nodes[Math.floor(i / 8)].id, to: node.id }));
  const graph = compileGraph({ nodes, edges }, SCOPE);
  const result = propagation(graph, signal('bounded', { eventType: 'AGENT_FAILED' }), NOW);
  assert.equal(result.length, 64);
  assert.equal(new Set(result.map(item => item.nodeId)).size, 64);
  assert.throws(() => compileGraph({ nodes: [...nodes, { id: 'overflow', scope: SCOPE }] }, SCOPE), /GRAPH_CAPACITY/);
});

test('inherited object properties are never accepted as event types', () => {
  for (const eventType of ['toString', '__proto__', 'constructor']) {
    assert.equal(signal('prototype', { eventType }), null);
  }
});

test('stale coverage cannot generate a new monitoring reflex', () => {
  const previous = physiology.advance(null, signal('blind', { payload: { observabilityCoverage: 0.2 } }), NOW).state;
  const now = NOW + 31000;
  const current = observation(event('later', { timestamp: new Date(now).toISOString() }), { scope: SCOPE, now });
  const result = physiology.advance(previous, current, now);
  assert.deepEqual(result.actions, []);
  assert.equal(result.state.coverage, null);
});

test('healthy samples separated by sensor expiry do not establish recovery', () => {
  let previous = physiology.advance(null, pressure('first', 0.2), NOW).state;
  previous = physiology.advance(previous, pressure('second', 0.2), NOW).state;
  const now = NOW + 31000;
  const current = observation(event('later', { timestamp: new Date(now).toISOString(),
    payload: { resourcePressure: 0.2 } }), { scope: SCOPE, now });
  const result = physiology.advance(previous, current, now);
  assert.equal(result.state.healthySamples, 1);
  assert.equal(result.state.mode, 'UNKNOWN');
});
