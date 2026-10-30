'use strict';

function observeExecutionStage1(__genosStageScope1) {
if (!__genosStageScope1.latest || __genosStageScope1.latest.id !== __genosStageScope1.run.id) return { value: ( { workerResult: 'done', run: __genosStageScope1.latest || __genosStageScope1.run }) };
}

async function observeExecutionStage2(__genosStageScope2) {
if (__genosStageScope2.observed.alive) {
    const deadline = __genosStageScope2.Date.parse(__genosStageScope2.latest.started_at) + __genosStageScope2.JSON.parse(__genosStageScope2.latest.budgets_json).seconds * 1000;
    if (__genosStageScope2.Date.now() < deadline) return { value: ( { run: __genosStageScope2.run }) };
    if (!await __genosStageScope2.harness.stop(__genosStageScope2.latest)) return { value: ( { run: __genosStageScope2.latest }) };
  }
}

function observeExecutionStage3(__genosStageScope3) {
if (__genosStageScope3.run.phase === 'finished' || __genosStageScope3.run.phase === 'verified') return { value: ( { workerResult: 'done', run: __genosStageScope3.run }) };
}

function observeExecutionStage4(__genosStageScope4) {
if (__genosStageScope4.run.phase === 'prepared' && __genosStageScope4.Date.now() - __genosStageScope4.Date.parse(__genosStageScope4.run.started_at) < 30000) return { value: ( { run: __genosStageScope4.run }) };
}

function observeExecutionStage5(__genosStageScope5) {
if (__genosStageScope5.latest.phase === 'finished' || __genosStageScope5.latest.phase === 'verified') return { value: ( { workerResult: 'done', run: __genosStageScope5.latest }) };
}

function observeExecutionStage6(__genosStageScope6) {
if (__genosStageScope6.latest.phase === 'prepared' && __genosStageScope6.Date.now() - __genosStageScope6.Date.parse(__genosStageScope6.latest.started_at) < 30000) return { value: ( { run: __genosStageScope6.latest }) };
}

module.exports = { observeExecutionStage1, observeExecutionStage2, observeExecutionStage3, observeExecutionStage4, observeExecutionStage5, observeExecutionStage6 };
