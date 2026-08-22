#!/usr/bin/env node

const { performance } = require('node:perf_hooks');
const { CircuitBreakerService } = require('../../backend/src/services/circuitBreaker');

const iterations = readPositiveInteger('--iterations', 100);
const durations = [];
let representativeEvents = [];

for (let iteration = 0; iteration < iterations; iteration += 1) {
  const events = [];
  const observer = { emitEvent: (event) => events.push(event) };
  const breaker = new CircuitBreakerService(observer);
  breaker.cooldownMs = 60_000;

  const started = performance.now();
  breaker.recordFailure('genos_run', 'injected failure 1');
  breaker.recordFailure('genos_run', 'injected failure 2');
  breaker.recordFailure('genos_run', 'injected failure 3');

  const openStatus = breaker.getStatus();
  assert(openStatus.state === 'OPEN', 'three injected failures must open the circuit');
  const destructiveBlocked = breaker.canExecute('genos_run', 'admin');
  assert(!destructiveBlocked.allowed && destructiveBlocked.reason === 'CIRCUIT_OPEN', 'open circuit must quarantine destructive tools');
  assert(breaker.canExecute('read_file', 'viewer').allowed, 'open circuit must not block read-only tools');

  breaker.cooldownMs = 0;
  breaker.lastStateChange = 0;
  const halfOpen = breaker.canExecute('genos_run', 'admin');
  assert(halfOpen.allowed && halfOpen.state === 'HALF-OPEN', 'cooldown must admit one half-open canary');
  breaker.recordSuccess('genos_run');
  assert(breaker.getStatus().state === 'CLOSED', 'successful canary must close the circuit');

  breaker.triggerHalt('benchmark injected emergency', 'benchmark');
  const halted = breaker.canExecute('read_file', 'admin');
  assert(!halted.allowed && halted.reason === 'SYSTEM_HALTED', 'kill switch must block read-only and destructive tools');
  breaker.resetHalt('benchmark');
  assert(breaker.canExecute('genos_run', 'admin').allowed, 'reset must restore execution');
  durations.push(Math.round((performance.now() - started) * 1_000_000));

  if (iteration === 0) representativeEvents = events.map((event) => event.eventType);
}

durations.sort((left, right) => left - right);
const mean = durations.reduce((sum, value) => sum + value, 0) / durations.length;
const report = {
  probe: 'genos.resilience.control-cycle',
  iterations,
  injected_failures_per_iteration: 3,
  predicates: {
    circuit_opens_at_threshold: true,
    destructive_call_quarantined: true,
    read_only_call_survives_open_circuit: true,
    half_open_canary_recovers: true,
    kill_switch_blocks_all_calls: true,
    reset_restores_execution: true,
  },
  control_cycle_latency_ns: {
    p50: percentile(durations, 0.50),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    mean,
    min: durations[0],
    max: durations[durations.length - 1],
  },
  representative_event_types: representativeEvents,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function percentile(values, quantile) {
  const index = Math.max(0, Math.ceil(values.length * quantile) - 1);
  return values[Math.min(index, values.length - 1)];
}

function readPositiveInteger(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  const value = Number.parseInt(process.argv[index + 1], 10);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${flag} must be a positive integer`);
  return value;
}
