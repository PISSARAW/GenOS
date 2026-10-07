'use strict';

const frameStore = require('../workspaceFrameStore');

async function feedback(options) {
  const frame = options?.frame || await frameStore.current({ agentId: options?.agentId, db: options?.db });
  if (!frame) return { precision: 0.5, prior: options?.prior || options?.missionPrior || [], frameId: null };
  const uncertainty = Number(frame.epistemicState?.uncertainty) || 0;
  const contradiction = Number(frame.epistemicState?.contradiction) || 0;
  const precision = Math.max(0.1, Math.min(0.9, 1 - uncertainty * 0.6 - contradiction * 0.2));
  return { precision, prior: options?.prior || options?.missionPrior || [], frameId: frame.frameId, attentionTarget: frame.attentionTarget };
}

module.exports = { feedback };
