/**
 * GenOS Execution Circuit Breaker & Emergency Kill Switch Service
 * 3-state sliding-window breaker (CLOSED, OPEN, HALF-OPEN) and military kill switch.
 */

const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');
const fs = require('fs');
const path = require('path');

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
    const persistedHalt = this.loadPersistedHalt();
    this.isHalted = Boolean(persistedHalt);
    this.haltReason = persistedHalt?.reason || null;
    this.haltTimestamp = persistedHalt?.haltedAt || null;
    this.toolLockOverrides = new Map(); // toolName -> boolean
    this.halfOpenProbe = null;
    this.scopedStates = new Map();
    this.executionHistory = new Map();
    this.maxConsecutiveToolCalls = 6;
  }

  loadPersistedHalt() {
    const root = process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
    const haltFile = path.join(root, '.genos', 'mcp.halted');
    try {
      if (!fs.existsSync(haltFile)) return null;
      const data = JSON.parse(fs.readFileSync(haltFile, 'utf8'));
      return { reason: data.reason || 'Persisted emergency halt', haltedAt: data.haltedAt || null };
    } catch (_) {
      return { reason: 'Persisted emergency halt', haltedAt: null };
    }
  }

  context(scope = 'global') {
    if (scope === 'global') return this;
    if (!this.scopedStates.has(scope)) this.scopedStates.set(scope, { state: 'CLOSED', failureCount: 0, lastFailureTime: 0, lastStateChange: Date.now(), halfOpenProbe: null });
    return this.scopedStates.get(scope);
  }

  isDestructive(toolName) {
    return DESTRUCTIVE_TOOLS.includes(toolName);
  }

  checkState(scope = 'global') {
    const state = this.context(scope);
    const now = Date.now();
    if (state.state === 'OPEN' && now - state.lastStateChange > this.cooldownMs) {
      state.state = 'HALF-OPEN';
      state.lastStateChange = now;
      telemetry.emitEvent({
        eventType: 'CIRCUIT_BREAKER_HALF_OPEN',
        agentId: 'circuit_breaker',
        action: 'STATE_TRANSITION',
        detail: 'Circuit breaker transitioned to HALF-OPEN (canary mode)',
        severity: 'warning'
      });
    }
    return state.state;
  }

  canExecute(toolName, userRole = 'viewer', scope = 'global', args = null) {
    if (this.isHalted) {
      return { allowed: false, reason: 'SYSTEM_HALTED', message: `Execution blocked. System is halted: ${this.haltReason}` };
    }

    const manualLock = this.toolLockOverrides.get(toolName);
    if (manualLock === true) {
      return { allowed: false, reason: 'TOOL_LOCKED', message: `Tool '${toolName}' is manually locked in quarantine.` };
    }

    // Anti-loop protection: detect identical consecutive executions even for non-destructive tools
    const argSig = args ? (typeof args === 'object' ? JSON.stringify(args) : String(args)) : '';
    const callSig = `${toolName}:${argSig}`;
    const history = this.executionHistory.get(scope) || { callSig: '', count: 0 };

    if (history.callSig === callSig) {
      history.count += 1;
    } else {
      history.callSig = callSig;
      history.count = 1;
    }
    this.executionHistory.set(scope, history);

    if (history.count >= this.maxConsecutiveToolCalls) {
      telemetry.emitEvent({
        eventType: 'CIRCUIT_BREAKER_TOOL_LOOP',
        agentId: typeof scope === 'string' ? scope : 'circuit_breaker',
        action: 'TOOL_LOOP_TRIP',
        detail: `Tool '${toolName}' executed identically ${history.count} consecutive times in scope '${scope}'. Throttling loop.`,
        severity: 'warning'
      });
      return {
        allowed: false,
        reason: 'TOOL_EXECUTION_LOOP',
        message: `Execution of tool '${toolName}' blocked: repeated identically ${history.count} consecutive times.`
      };
    }

    const state = this.checkState(scope);
    const stateContext = this.context(scope);
    const isDestructive = this.isDestructive(toolName);

    if (isDestructive && userRole !== 'admin') {
      return { allowed: false, reason: 'INSUFFICIENT_ROLE', message: `High-risk tool '${toolName}' requires Level 5 Admin role.` };
    }

    if (state === 'OPEN' && isDestructive) {
      return { allowed: false, reason: 'CIRCUIT_OPEN', message: `Circuit breaker is OPEN. High-risk tools are quarantined.` };
    }

    if (state === 'HALF-OPEN' && isDestructive) {
      if (stateContext.halfOpenProbe) {
        return { allowed: false, reason: 'CANARY_IN_PROGRESS', message: `Circuit breaker canary '${stateContext.halfOpenProbe}' is already in progress.` };
      }
      stateContext.halfOpenProbe = toolName;
    }

    return { allowed: true, state };
  }

  recordSuccess(toolName, scope = 'global') {
    const state = this.context(scope);
    if (state.state === 'HALF-OPEN' && state.halfOpenProbe === toolName) {
      state.state = 'CLOSED';
      state.failureCount = 0;
      state.halfOpenProbe = null;
      state.lastStateChange = Date.now();
      telemetry.emitEvent({
        eventType: 'CIRCUIT_BREAKER_RESET',
        agentId: 'circuit_breaker',
        action: 'RESET',
        detail: `Canary execution of '${toolName}' succeeded. Circuit breaker reset to CLOSED.`,
        severity: 'info'
      });
      return;
    }
    if (state.state === 'CLOSED') {
      state.failureCount = 0;
      state.lastFailureTime = 0;
    }
  }

  recordFailure(toolName, errorDetail, scope = 'global') {
    const state = this.context(scope);
    const now = Date.now();
    if (now - state.lastFailureTime > this.failureWindowMs) {
      state.failureCount = 1;
    } else {
      state.failureCount += 1;
    }
    state.lastFailureTime = now;

    telemetry.emitEvent({
      eventType: 'TOOL_FAILURE',
      agentId: 'circuit_breaker',
      action: 'FAILURE_RECORDED',
      detail: `Tool '${toolName}' failed (${state.failureCount}/3). Error: ${errorDetail}`,
      severity: 'warning'
    });

    if (state.failureCount >= 3 || (state.state === 'HALF-OPEN' && state.halfOpenProbe === toolName)) {
      state.state = 'OPEN';
      state.halfOpenProbe = null;
      state.lastStateChange = now;
      telemetry.emitEvent({
        eventType: 'CIRCUIT_BREAKER_TRIPPED',
        agentId: 'circuit_breaker',
        action: 'TRIP',
        detail: `Circuit breaker TRIPPED to OPEN after tool failure: ${toolName}`,
        severity: 'critical'
      });
    }
  }

  trip(scope = 'global', reason = 'manual') {
    const state = this.context(scope);
    const now = Date.now();
    state.state = 'OPEN';
    state.halfOpenProbe = null;
    state.lastStateChange = now;
    telemetry.emitEvent({
      eventType: 'CIRCUIT_BREAKER_TRIPPED',
      agentId: 'circuit_breaker',
      action: 'TRIP',
      detail: `Circuit breaker manually tripped for scope '${scope}': ${reason}`,
      severity: 'critical'
    });
    return state.state;
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
    this.lastFailureTime = 0;
    this.halfOpenProbe = null;
    this.scopedStates.clear();
    this.executionHistory.clear();

    telemetry.emitEvent({
      eventType: 'KILL_SWITCH_RESET',
      agentId: source,
      action: 'SYSTEM_RESUME',
      detail: 'MCP kill switch reset. New MCP tool invocations may resume.',
      severity: 'info'
    });

    return { status: 'resumed', state: this.state };
  }

  getStatus(scope = 'global') {
    const state = this.context(scope);
    const currentState = this.checkState(scope);
    const scopes = {};
    if (scope === 'global') {
      for (const [name, scopedState] of this.scopedStates.entries()) {
        const scopedCurrentState = this.checkState(name);
        scopes[name] = {
          state: scopedCurrentState,
          failureCount: scopedState.failureCount,
          isOpen: scopedCurrentState === 'OPEN',
          halfOpenProbe: scopedState.halfOpenProbe
        };
      }
    }
    return {
      state: currentState,
      failureCount: state.failureCount,
      failures: state.failureCount,
      isOpen: currentState === 'OPEN',
      isHalted: this.isHalted,
      haltReason: this.haltReason,
      haltTimestamp: this.haltTimestamp,
      halfOpenProbe: state.halfOpenProbe,
      scopes,
      quarantinedTools: Array.from(this.toolLockOverrides.entries()).filter(([_, v]) => v).map(([k]) => k)
    };
  }
}

const circuitBreaker = new CircuitBreakerService();

module.exports = circuitBreaker;
