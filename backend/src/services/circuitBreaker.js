/**
 * GenOS Execution Circuit Breaker & Emergency Kill Switch Service
 * 3-state sliding-window breaker (CLOSED, OPEN, HALF-OPEN) and military kill switch.
 */

const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');

const DESTRUCTIVE_TOOLS = [
  'genos_run',
  'genos_merge',
  'genos_restore',
  'genos_resilience_apoptosis',
  'genos_resilience_circuit_breaker',
  'genos_resilience_cryptobiosis',
  'genos_resilience_hypermutation',
  'genos_invalidate_assumption',
  'genos_security_coevolution'
];

class CircuitBreakerService {
  constructor() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.failureWindowMs = 60000; // 60s window
    this.cooldownMs = 60000;
    this.lastFailureTime = 0;
    this.lastStateChange = Date.now();
    this.isHalted = false;
    this.haltReason = null;
    this.haltTimestamp = null;
    this.toolLockOverrides = new Map(); // toolName -> boolean
  }

  isDestructive(toolName) {
    return DESTRUCTIVE_TOOLS.includes(toolName);
  }

  checkState() {
    const now = Date.now();
    if (this.state === 'OPEN' && now - this.lastStateChange > this.cooldownMs) {
      this.state = 'HALF-OPEN';
      this.lastStateChange = now;
      telemetry.emitEvent({
        eventType: 'CIRCUIT_BREAKER_HALF_OPEN',
        agentId: 'circuit_breaker',
        action: 'STATE_TRANSITION',
        detail: 'Circuit breaker transitioned to HALF-OPEN (canary mode)',
        severity: 'warning'
      });
    }
    return this.state;
  }

  canExecute(toolName, userRole = 'viewer') {
    if (this.isHalted) {
      return { allowed: false, reason: 'SYSTEM_HALTED', message: `Execution blocked. System is halted: ${this.haltReason}` };
    }

    const manualLock = this.toolLockOverrides.get(toolName);
    if (manualLock === true) {
      return { allowed: false, reason: 'TOOL_LOCKED', message: `Tool '${toolName}' is manually locked in quarantine.` };
    }

    const state = this.checkState();
    const isDestructive = this.isDestructive(toolName);

    if (isDestructive && userRole !== 'admin') {
      return { allowed: false, reason: 'INSUFFICIENT_ROLE', message: `High-risk tool '${toolName}' requires Level 5 Admin role.` };
    }

    if (state === 'OPEN' && isDestructive) {
      return { allowed: false, reason: 'CIRCUIT_OPEN', message: `Circuit breaker is OPEN. High-risk tools are quarantined.` };
    }

    return { allowed: true, state };
  }

  recordSuccess(toolName) {
    if (this.state === 'HALF-OPEN') {
      this.state = 'CLOSED';
      this.failureCount = 0;
      this.lastStateChange = Date.now();
      telemetry.emitEvent({
        eventType: 'CIRCUIT_BREAKER_RESET',
        agentId: 'circuit_breaker',
        action: 'RESET',
        detail: `Canary execution of '${toolName}' succeeded. Circuit breaker reset to CLOSED.`,
        severity: 'info'
      });
    }
  }

  recordFailure(toolName, errorDetail) {
    const now = Date.now();
    if (now - this.lastFailureTime > this.failureWindowMs) {
      this.failureCount = 1;
    } else {
      this.failureCount += 1;
    }
    this.lastFailureTime = now;

    telemetry.emitEvent({
      eventType: 'TOOL_FAILURE',
      agentId: 'circuit_breaker',
      action: 'FAILURE_RECORDED',
      detail: `Tool '${toolName}' failed (${this.failureCount}/3). Error: ${errorDetail}`,
      severity: 'warning'
    });

    if (this.failureCount >= 3 || this.state === 'HALF-OPEN') {
      this.state = 'OPEN';
      this.lastStateChange = now;
      telemetry.emitEvent({
        eventType: 'CIRCUIT_BREAKER_TRIPPED',
        agentId: 'circuit_breaker',
        action: 'TRIP',
        detail: `Circuit breaker TRIPPED to OPEN after tool failure: ${toolName}`,
        severity: 'critical'
      });
    }
  }

  toggleToolLock(toolName, locked, reason = '') {
    this.toolLockOverrides.set(toolName, locked);
    telemetry.emitEvent({
      eventType: 'TOOL_QUARANTINE_TOGGLE',
      agentId: 'circuit_breaker',
      action: locked ? 'LOCK' : 'UNLOCK',
      detail: `Tool '${toolName}' quarantine status set to ${locked}. Reason: ${reason}`,
      severity: locked ? 'warning' : 'info'
    });
  }

  triggerHalt(reason = 'Manual Kill Switch Activated', source = 'admin') {
    this.isHalted = true;
    this.haltReason = reason;
    this.haltTimestamp = new Date().toISOString();

    telemetry.emitEvent({
      eventType: 'KILL_SWITCH_ENGAGED',
      agentId: source,
      action: 'GLOBAL_HALT',
      detail: `EMERGENCY KILL SWITCH ENGAGED: ${reason}`,
      severity: 'critical'
    });

    return { status: 'halted', reason, timestamp: this.haltTimestamp };
  }

  resetHalt(source = 'admin') {
    this.isHalted = false;
    this.haltReason = null;
    this.haltTimestamp = null;
    this.state = 'CLOSED';
    this.failureCount = 0;

    telemetry.emitEvent({
      eventType: 'KILL_SWITCH_RESET',
      agentId: source,
      action: 'SYSTEM_RESUME',
      detail: 'MCP kill switch reset. New MCP tool invocations may resume.',
      severity: 'info'
    });

    return { status: 'resumed', state: this.state };
  }

  getStatus() {
    return {
      state: this.checkState(),
      failureCount: this.failureCount,
      isHalted: this.isHalted,
      haltReason: this.haltReason,
      haltTimestamp: this.haltTimestamp,
      quarantinedTools: Array.from(this.toolLockOverrides.entries()).filter(([_, v]) => v).map(([k]) => k)
    };
  }
}

const circuitBreaker = new CircuitBreakerService();

module.exports = circuitBreaker;
