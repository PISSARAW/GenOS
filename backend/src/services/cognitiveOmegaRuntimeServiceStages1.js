'use strict';

async function executeStage1(__genosStageScope1) {
if (__genosStageScope1.journalDb) {
      if (typeof __genosStageScope1.input.runId !== 'string' || !__genosStageScope1.input.runId) return { value: ( __genosStageScope1.handlersService.blocked('journal_run_id_required')) };
      try {
        await __genosStageScope1.executionJournal.beginRun(__genosStageScope1.journalDb, __genosStageScope1.input.runId, (0, __genosStageScope1.journalRequest)(__genosStageScope1.input));
      } catch (error) {
        return { value: ( __genosStageScope1.handlersService.blocked(error.message)) };
      }
    }
}

function executeStage2(__genosStageScope2) {
if (!__genosStageScope2.Array.isArray(__genosStageScope2.input.operations) || !__genosStageScope2.input.operations.length) return { value: ( __genosStageScope2.handlersService.blocked('program_empty')) };
}

async function executeStage3(__genosStageScope3) {
if (__genosStageScope3.journalDb && !__genosStageScope3.cached) await __genosStageScope3.executionJournal.beginOperation(__genosStageScope3.journalDb,
          { runId: __genosStageScope3.input.runId, operationId: __genosStageScope3.operation.id, operation: __genosStageScope3.operation });
}

async function executeStage4(__genosStageScope4) {
if (__genosStageScope4.journalDb) await __genosStageScope4.executionJournal.completeOperation(__genosStageScope4.journalDb,
          { runId: __genosStageScope4.input.runId, operationId: __genosStageScope4.operation.id,
            result: (0, __genosStageScope4.journalResult)(__genosStageScope4.result, __genosStageScope4.state, __genosStageScope4.operation) });
}

async function executeStage5(__genosStageScope5) {
for (const obligation of __genosStageScope5.plan.obligations) {
      const operation = __genosStageScope5.byId.get(obligation.id);
      const dependenciesReady = (0, __genosStageScope5.dependenciesExecuted)(operation, __genosStageScope5.results);
      if (!dependenciesReady) return { value: ( { status: 'blocked', reason: 'dependency_execution_failed', results: __genosStageScope5.results }) };
      (0, __genosStageScope5.registerOperationVerifier)(operation, __genosStageScope5.state.verifierRegistry);
      const handler = __genosStageScope5.handlers[operation.kind];
      try {
        const cached = __genosStageScope5.journalDb ? await __genosStageScope5.executionJournal.findOperation({ db: __genosStageScope5.journalDb, runId: __genosStageScope5.input.runId, operationId: operation.id, operation: operation }) : null;
        if (cached?.status === 'completed') {
          (0, __genosStageScope5.applyJournalResult)(__genosStageScope5.state, operation, cached.result);
          __genosStageScope5.results.push({ id: operation.id, kind: operation.kind, ...cached.result.operationResult });
          if (cached.result.operationResult.status === 'blocked') return { value: ( {
            status: 'blocked', reason: cached.result.operationResult.reason, results: __genosStageScope5.results }) };
          continue;
        }
        if ((0, __genosStageScope5.require)('./cognitiveOmegaRuntimeServiceValues1.js').executeValue1({ journalDb: __genosStageScope5.journalDb, get operation() { return operation; }, runtimeState: __genosStageScope5.runtimeState })) {
          return { value: ( { status: 'blocked', reason: 'durable_effect_idempotency_required',
            operation: operation.id, results: __genosStageScope5.results }) };
        }
        await (0, __genosStageScope5.require)('./cognitiveOmegaRuntimeServiceStages1.js').executeStage3({ cached, executionJournal: __genosStageScope5.executionJournal, input: __genosStageScope5.input, journalDb: __genosStageScope5.journalDb, get operation() { return operation; }, set operation(__genosNextStageValue) { operation = __genosNextStageValue; } });
        const executable = (0, __genosStageScope5.require)('./cognitiveOmegaRuntimeServiceValues1.js').executeValue2({ input: __genosStageScope5.input, journalDb: __genosStageScope5.journalDb, get operation() { return operation; } });
        const result = await handler(executable, __genosStageScope5.state);
        await (0, __genosStageScope5.require)('./cognitiveOmegaRuntimeServiceStages1.js').executeStage4({ executionJournal: __genosStageScope5.executionJournal, input: __genosStageScope5.input, journalDb: __genosStageScope5.journalDb, journalResult: __genosStageScope5.journalResult, get operation() { return operation; }, set operation(__genosNextStageValue) { operation = __genosNextStageValue; }, result, get state() { return __genosStageScope5.state; }, set state(__genosNextStageValue) { __genosStageScope5.state = __genosNextStageValue; } });
        __genosStageScope5.results.push({ id: operation.id, kind: operation.kind, ...result });
        if (result.status === 'blocked') return { value: ( { status: 'blocked', reason: result.reason, results: __genosStageScope5.results }) };
      } catch (error) {
        return { value: ( { status: 'blocked', reason: 'operation_failed', operation: operation.id,
          error: error.message, results: __genosStageScope5.results }) };
      }
    }
}

module.exports = { executeStage1, executeStage2, executeStage3, executeStage4, executeStage5 };
