'use strict';

async function beginJournaledRun(context) {
if (context.journalDb) {
      if (typeof context.input.runId !== 'string' || !context.input.runId) return { value: ( context.handlersService.blocked('journal_run_id_required')) };
      try {
        await context.executionJournal.beginRun(context.journalDb, context.input.runId, context.journalRequest(context.input));
      } catch (error) {
        return { value: ( context.handlersService.blocked(error.message)) };
      }
    }
}

function execute(context) {
if (!context.Array.isArray(context.input.operations) || !context.input.operations.length) return { value: ( context.handlersService.blocked('program_empty')) };
}

async function beginJournaledOperation(context) {
if (context.journalDb && !context.cached) await context.executionJournal.beginOperation(context.journalDb,
          { runId: context.input.runId, operationId: context.operation.id, operation: context.operation });
}

async function completeJournaledOperation(context) {
if (context.journalDb) await context.executionJournal.completeOperation(context.journalDb,
          { runId: context.input.runId, operationId: context.operation.id,
            result: context.journalResult(context.result, context.state, context.operation) });
}

async function executeObligations(context) {
for (const obligation of context.plan.obligations) {
      const operation = context.byId.get(obligation.id);
      const dependenciesReady = context.dependenciesExecuted(operation, context.results);
      if (!dependenciesReady) return { value: ( { status: 'blocked', reason: 'dependency_execution_failed', results: context.results }) };
      context.registerOperationVerifier(operation, context.state.verifierRegistry);
      const handler = context.handlers[operation.kind];
      try {
        const cached = context.journalDb ? await context.executionJournal.findOperation({ db: context.journalDb, runId: context.input.runId, operationId: operation.id, operation: operation }) : null;
        if (cached?.status === 'completed') {
          context.applyJournalResult(context.state, operation, cached.result);
          context.results.push({ id: operation.id, kind: operation.kind, ...cached.result.operationResult });
          if (cached.result.operationResult.status === 'blocked') return { value: ( {
            status: 'blocked', reason: cached.result.operationResult.reason, results: context.results }) };
          continue;
        }
        if (context.require('./cognitiveOmegaRuntimeServiceRules.js').executeRule1({ journalDb: context.journalDb, get operation() { return operation; }, runtimeState: context.runtimeState })) {
          return { value: ( { status: 'blocked', reason: 'durable_effect_idempotency_required',
            operation: operation.id, results: context.results }) };
        }
        await context.require('./cognitiveOmegaRuntimeServiceWorkflow.js').beginJournaledOperation({ cached, executionJournal: context.executionJournal, input: context.input, journalDb: context.journalDb, get operation() { return operation; }, set operation(nextValue) { operation = nextValue; } });
        const executable = context.require('./cognitiveOmegaRuntimeServiceRules.js').executeRule2({ input: context.input, journalDb: context.journalDb, get operation() { return operation; } });
        const result = await handler(executable, context.state);
        await context.require('./cognitiveOmegaRuntimeServiceWorkflow.js').completeJournaledOperation({ executionJournal: context.executionJournal, input: context.input, journalDb: context.journalDb, journalResult: context.journalResult, get operation() { return operation; }, set operation(nextValue) { operation = nextValue; }, result, get state() { return context.state; }, set state(nextValue) { context.state = nextValue; } });
        context.results.push({ id: operation.id, kind: operation.kind, ...result });
        if (result.status === 'blocked') return { value: ( { status: 'blocked', reason: result.reason, results: context.results }) };
      } catch (error) {
        return { value: ( { status: 'blocked', reason: 'operation_failed', operation: operation.id,
          error: error.message, results: context.results }) };
      }
    }
}

module.exports = { beginJournaledRun, execute, beginJournaledOperation, completeJournaledOperation, executeObligations };
