'use strict';

const crypto = require('crypto');
const observationService = require('./observationService');
const sensorium = require('./sensoriumService');

const PERCEPTION_TOOLS = new Set([
  'genos_browser_act', 'genos_foveal_crop', 'genos_optimal_foraging', 'genos_computer_use'
]);

function parseOutput(result) {
  const output = result?.structuredContent || result?.output || result;
  if (typeof output !== 'string') return output || {};
  try { return JSON.parse(output); } catch { return { summary: output.slice(0, 1200) }; }
}

function observationSource(body) {
  return body.observationAfter || body.observation || body;
}

function observationData(body) {
  const source = observationSource(body);
  return {
    summary: observationSummary(source, body),
    ...observationLocation(source, body),
    ...observationArtifacts(source, body)
  };
}

function observationSummary(source, body) {
  return String(source.observationText || source.summary || source.title || body.summary || '').slice(0, 1200);
}

function observationLocation(source, body) {
  return { title: source.title || body.title || null, url: source.currentUrl || body.observedUrl || body.url || null };
}

function observationArtifacts(source, body) {
  return {
    informationGain: boundedGain(source.infoGain ?? body.observationGain),
    evidenceRef: body.receipt?.evidenceRef || body.evidenceRef || null,
    imageHash: body.fovealArtifact?.sha256 || body.sha256 || null
  };
}

function boundedGain(value) {
  const gain = Number(value);
  return Number.isFinite(gain) ? Math.max(0, Math.min(1, gain)) : 0;
}

function ensureSensorium(agentId) {
  const existing = sensorium.getSensorium(agentId);
  return existing || sensorium.createSensorium({ agentId });
}

function makePercept({ agentId, actionId, toolName, args, body }) {
  const data = observationData(body);
  return observationService.makeObservation({
    id: actionId ? `perception_${crypto.createHash('sha256').update(`${agentId}:${actionId}`).digest('hex').slice(0, 32)}` : undefined,
    sensorId: toolName,
    agentId,
    target: args?.url || args?.image_path || args?.target || data.url,
    data,
    uncertaintyBefore: 1,
    uncertaintyAfter: 1 - data.informationGain
  });
}

function emitObservation(input, observation) {
  const { telemetry, agentId, toolName, actionId, args } = input;
  telemetry.emitEvent({
    eventType: 'PERCEPTION_OBSERVED', agentId, action: toolName,
    detail: `Captured an observation from ${toolName}.`, severity: 'info',
    payload: {
      toolName, sourceActionId: actionId || null,
      goal: args?.goal || args?.task || args?.mission || null,
      observation
    }
  });
}

function recordToolObservation(input = {}) {
  const { telemetry, agentId, toolName, result, actionId } = input;
  if (!PERCEPTION_TOOLS.has(toolName) || result?.success !== true || !agentId || !telemetry?.emitEvent) return null;
  const body = parseOutput(result);
  const observation = makePercept({ ...input, body });
  ensureSensorium(agentId);
  sensorium.recordObservation({ agentId, observation });
  emitObservation(input, observation);
  return observation;
}

module.exports = { recordToolObservation, PERCEPTION_TOOLS, parseOutput, observationData };
