'use strict';

const { validateSchema } = require('./variantExecutionService');

function pipelinePolicy(mission, members) {
  const stages = Array.isArray(mission.stages) ? mission.stages : members.map((m, i) => ({
    stageId: `stage_${i + 1}`,
    memberId: memberId(m),
    name: defaultTo(m.stageName, `Stage ${i + 1}`),
    inputSchema: defaultTo(m.inputSchema, { type: 'object' }),
    outputSchema: defaultTo(m.outputSchema, { type: 'object' })
  }));

  const contracts = stages.map((stage) => buildStageContract(stage, mission));

  return {
    pipelineStages: stages,
    stageContracts: contracts,
    executionModel: buildExecutionModel(mission),
    artifactFlow: { typedHandoffs: true, validationAtEachStage: true, evidenceRequiredPerStage: true }
  };
}

function buildStageContract(stage, mission) {
  const errors = [...validateSchema(stage.inputSchema), ...validateSchema(stage.outputSchema)];
  if (errors.length) throw coded(`Stage '${stage.stageId}' schema invalid: ${errors.join(' ')}`, 'ATEAM_PIPELINE_SCHEMA_INVALID');
  return { stageId: stage.stageId, memberId: stage.memberId, name: stage.name, inputSchema: stage.inputSchema, outputSchema: stage.outputSchema, contractValidationRequired: true, validationMode: defaultTo(mission.validationMode, 'strict') };
}

function buildExecutionModel(mission) {
  return {
      type: 'sequential',
      backpressure: {
        enabled: true,
        highWatermark: defaultTo(mission.backpressureHighWatermark, 10),
        lowWatermark: defaultTo(mission.backpressureLowWatermark, 2),
        strategy: defaultTo(mission.backpressureStrategy, 'pause_upstream')
      },
      streaming: {
        enabled: mission.streamingEnabled || false,
        chunkSize: defaultTo(mission.streamChunkSize, 1024),
        flushInterval: defaultTo(mission.streamFlushInterval, 100)
      },
      localRetry: {
        enabled: true,
        maxRetries: defaultTo(mission.maxRetries, 3),
        backoffMs: defaultTo(mission.retryBackoffMs, 1000),
        retryableErrors: defaultTo(mission.retryableErrors, ['TIMEOUT', 'TRANSIENT_FAILURE'])
      },
      stageCache: {
        enabled: mission.cacheEnabled !== false,
        ttlMs: defaultTo(mission.cacheTtlMs, 3600000),
        maxEntries: defaultTo(mission.cacheMaxEntries, 100),
        invalidationPolicy: defaultTo(mission.cacheInvalidation, 'on_input_change')
      },
      resumeFromLastValid: {
        enabled: true,
        checkpointInterval: defaultTo(mission.checkpointInterval, 1),
        statePersistence: 'full'
      }
    };
}

function defaultTo(value, fallback) { return value || fallback; }

function memberId(member = {}) { return member.memberId || member.agentId || member.workerId || member.domain || member.subSystem || member.label || member.role || null; }
function coded(message, code) { return Object.assign(new Error(message), { code }); }
module.exports = { pipelinePolicy };
