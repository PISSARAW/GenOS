'use strict';

const crypto = require('crypto');
const migrationService = require('./patchMigrationService');

function execute(ecology, decision, options = {}) {
  if (decision.decision !== 'PATCH_DEPARTURE' || !decision.alternative) {
    return { action: { type: 'CONTINUE_FORAGING', status: 'applied' }, migration: null, execution: null };
  }
  const alternative = decision.alternative;
  const migration = options.populationId ? migrationService.migrate({
    ecology, populationId: options.populationId, individualId: options.individualId,
    targetPatch: alternative.patchId, migrationCost: options.migrationCost
  }) : null;
  const execution = requestExecution(ecology, alternative, options);
  return { action: { type: 'MIGRATE_AND_EXECUTE_PATCH', status: migration ? 'applied' : 'requested', targetPatch: alternative.patchId }, migration, execution };
}

function requestExecution(ecology, alternative, options) {
  const execution = {
    actionId: crypto.randomUUID(), type: 'EXECUTE_PATCH', status: 'requested',
    targetPatch: alternative.patchId, operation: alternative.operation,
    populationId: options.populationId || null, individualId: options.individualId || null,
    requestedAt: new Date().toISOString()
  };
  const queue = ecology.ecologicalState.patchExecutions || [];
  ecology.ecologicalState.patchExecutions = [...queue, execution];
  return execution;
}

module.exports = { execute };
