'use strict';

const assert = require('node:assert/strict');
const { GateExecutor } = require('../src/services/morphogenesis/runtime/operators/gateExecutor');

const executor = new GateExecutor({});

function safeRulesAreEvaluated() {
  const data = { confidence: 0.8, status: 'verified', tags: ['safe', 'reviewed'] };
  const rule = { and: [
    { '>=': [{ var: 'confidence' }, 0.75] },
    { '==': [{ var: 'status' }, 'verified'] },
    { in: ['safe', { var: 'tags' }] }
  ] };
  assert.equal(executor.evalExpression(data, rule), true);
  assert.equal(executor.evalExpression(data, JSON.stringify(rule)), true);
  assert.equal(executor.evalExpression(data, { '<': [{ var: 'confidence' }, 0.5] }), false);
}

function javascriptPayloadsAreRejected() {
  globalThis.__genosGateInjectionProbe = false;
  const payload = '(() => { globalThis.__genosGateInjectionProbe = true; return true; })()';
  assert.throws(
    () => executor.evaluateCondition({}, { condition: { expression: payload } }),
    /string expressions must contain valid JSON/
  );
  assert.throws(() => executor.evalExpression({}, JSON.stringify(payload)), /root rule must contain an operator/);
  assert.equal(globalThis.__genosGateInjectionProbe, false);
  delete globalThis.__genosGateInjectionProbe;
}

function processPayloadsHaveNoSideEffects() {
  const key = 'GENOS_GATE_EXPRESSION_INJECTION_PROBE';
  delete process.env[key];
  const payload = `(() => { process.env.${key} = 'owned'; return true; })()`;
  assert.throws(() => executor.evalExpression({}, payload), /Invalid gate condition expression/);
  assert.equal(process.env[key], undefined);
}

function dangerousPathsAndOperatorsAreRejected() {
  assert.throws(
    () => executor.evalExpression({}, { var: 'constructor.constructor' }),
    /forbidden data path segment/
  );
  assert.throws(
    () => executor.evalExpression({}, { call: ['process.exit', 0] }),
    /unsupported operator/
  );
  assert.throws(
    () => executor.evalExpression({}, JSON.parse('{"constructor":[]}')),
    /unsupported operator/
  );
}

function accessorsAreNotInvoked() {
  let accessed = false;
  const data = {};
  Object.defineProperty(data, 'secret', { enumerable: true, get() { accessed = true; return true; } });
  assert.throws(() => executor.evalExpression(data, { var: 'secret' }), /data accessor properties are forbidden/);
  assert.equal(accessed, false);
}

function coercionHooksAreNotInvoked() {
  let coerced = false;
  const malicious = { valueOf() { coerced = true; return 1; } };
  assert.throws(
    () => executor.evalExpression({ malicious }, { '>': [{ var: 'malicious' }, 0] }),
    /ordered comparisons require two numbers or two strings/
  );
  assert.equal(coerced, false);
}

safeRulesAreEvaluated();
javascriptPayloadsAreRejected();
processPayloadsHaveNoSideEffects();
dangerousPathsAndOperatorsAreRejected();
accessorsAreNotInvoked();
coercionHooksAreNotInvoked();
console.log('Restricted gate expressions reject code injection without side effects: PASS');
