'use strict';

const MAX_HISTORY = 100;
const framesByAgent = new Map();

function save(options) {
  const { frame } = options || {};
  if (!frame?.agentId || !frame?.frameId) return { saved: false };
  const history = framesByAgent.get(frame.agentId) || [];
  history.push(frame);
  framesByAgent.set(frame.agentId, history.slice(-MAX_HISTORY));
  return { saved: true, frame };
}

function current(options) {
  const history = framesByAgent.get(options?.agentId) || [];
  return history.at(-1) || null;
}

function get(options) {
  const history = framesByAgent.get(options?.agentId) || [];
  return history.find((frame) => frame.frameId === options?.frameId) || null;
}

function history(options) {
  return [...(framesByAgent.get(options?.agentId) || [])];
}

function clear(options) {
  if (options?.agentId) framesByAgent.delete(options.agentId);
  else framesByAgent.clear();
}

module.exports = { save, current, get, history, clear, MAX_HISTORY };
