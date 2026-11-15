'use strict';

function observeExecutionStep1(context) {
if (!context.latest || context.latest.id !== context.run.id) return { value: ( { workerResult: 'done', run: context.latest || context.run }) };
}

async function stopExpiredExecution(context) {
if (context.observed.alive) {
    const deadline = context.Date.parse(context.latest.started_at) + context.JSON.parse(context.latest.budgets_json).seconds * 1000;
    if (context.Date.now() < deadline) return { value: ( { run: context.run }) };
    if (!await context.harness.stop(context.latest)) return { value: ( { run: context.latest }) };
  }
}

function observeExecutionStep3(context) {
if (context.run.phase === 'finished' || context.run.phase === 'verified') return { value: ( { workerResult: 'done', run: context.run }) };
}

function observeExecutionStep4(context) {
if (context.run.phase === 'prepared' && context.Date.now() - context.Date.parse(context.run.started_at) < 30000) return { value: ( { run: context.run }) };
}

function observeExecutionStep5(context) {
if (context.latest.phase === 'finished' || context.latest.phase === 'verified') return { value: ( { workerResult: 'done', run: context.latest }) };
}

function observeExecutionStep6(context) {
if (context.latest.phase === 'prepared' && context.Date.now() - context.Date.parse(context.latest.started_at) < 30000) return { value: ( { run: context.latest }) };
}

module.exports = { observeExecutionStep1, stopExpiredExecution, observeExecutionStep3, observeExecutionStep4, observeExecutionStep5, observeExecutionStep6 };
