'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { OmegaAdmission } = require('../../src/services/omegaProtocol/admission');
const { OmegaExecution } = require('../../src/services/omegaProtocol/execution');
const { EffectGate } = require('../../src/services/omegaProtocol/effects');
const fixture = require('./omegaProcessFixtures.cjs');
const { createHandlers } = require('./omegaProcessHandlers.cjs');
const same = (left, right) => digest(left) === digest(right);

function evidence(request) {
  if (!same(request, fixture.expectedEffect())) {
    throw new Error('OMEGA demo effect evidence or plan binding rejected.');
  }
  return { status: 'validated', requestDigest: digest(request), receiptDigest: digest(['effect-check', request]) };
}

function authorizeMessage(principal, message) {
  return same(principal(), fixture.CLIENT) && same(message.sender, fixture.CLIENT) &&
    same(message.audience, fixture.EXECUTOR) && same(message.scope, fixture.SCOPE) && same(message.authority, fixture.AUTHORITY);
}

function verifyPlan(request, current) {
  if (current.baseDigest !== request.plan.baseDigest || current.environmentDigest !== request.plan.environmentDigest ||
      !same(request.plan.budget, fixture.BUDGET)) throw new Error('OMEGA demo source context or budget changed.');
  return { status: 'validated', requestDigest: digest(request), receiptDigest: digest(['plan-check', request]) };
}

function authorizeEffect(principal, request) {
  return same(principal(), fixture.CLIENT) && same(request.actor, fixture.CLIENT) &&
    same(request.scope, fixture.SCOPE) && same(request.authority, fixture.AUTHORITY);
}

function currentContext(directory) {
  const environment = JSON.parse(fs.readFileSync(path.join(directory, 'environment.json'), 'utf8'));
  if (environment.node !== process.version || environment.handlerRevision !== fixture.ENVIRONMENT.handlerRevision) {
    throw new Error('OMEGA installed execution environment differs from declaration.');
  }
  return { baseDigest: digest(JSON.parse(fs.readFileSync(path.join(directory, 'source.json'), 'utf8'))),
    environmentDigest: digest(environment), generations: fixture.GENERATIONS };
}

function createExecutor(options) {
  const directory = options.directory;
  const counters = () => JSON.parse(fs.readFileSync(path.join(directory, 'counters.json'), 'utf8'));
  const count = kind => {
    const value = counters(); value[kind] += 1;
    fs.writeFileSync(path.join(directory, 'counters.json'), JSON.stringify(value));
  };
  const authorize = message => authorizeMessage(options.principal, message);
  const admission = new OmegaAdmission({ dbPath: path.join(directory, 'admission.sqlite'), authorize,
    describeRuntime: () => fixture.CAPS,
    verifyPlan: request => verifyPlan(request, currentContext(directory)) });
  const gate = new EffectGate({ dbPath: path.join(directory, 'effects.sqlite'),
    authorize: ({ request }) => authorizeEffect(options.principal, request),
    verifyEvidence: evidence, dispatch: options.dispatch,
    reconcile: request => options.rpc('resource', 'reconcile', request) });
  const handlers = createHandlers({ directory, count });
  const execution = new OmegaExecution({ dbPath: path.join(directory, 'execution.sqlite'), authorize,
    resolvePlan: query => admission.acceptedPlan(query), describeRuntime: () => fixture.CAPS,
    currentContext: () => currentContext(directory), handlers, effectGate: gate });
  const effectRequest = () => {
    const state = execution.state(fixture.RUN_QUERY);
    return state ? execution.store.effect(state.binding, 'emit')?.request : null;
  };
  return { admission, execution, gate, counters, effectRequest, authorize,
    close() { admission.close(); execution.close(); gate.close(); } };
}

module.exports = { createExecutor, evidence };
