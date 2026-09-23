'use strict';

const { getStrategy } = require('../../strategies/strategyRegistry');

const PHASE_STATUSES = ['active', 'completed', 'abandoned', 'failed'];
const DEFAULT_MAX_PHASES = 50;

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePhaseStatus(status) {
  return PHASE_STATUSES.includes(status) ? status : 'active';
}

function startTrajectory(missionId) {
  if (!missionId) throw new Error('missionId is required');
  return {
    id: generateId('traj'),
    missionId,
    phases: [],
    currentPhaseIndex: -1,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function addPhase(ctx) {
  const { trajectoryId, strategy, reason, evidence } = ctx || {};
  if (!trajectoryId) throw new Error('trajectoryId is required');
  if (!strategy) throw new Error('strategy is required');
  if (!reason) throw new Error('reason is required');
  const strategyDef = typeof strategy === 'string' ? getStrategy(strategy) : strategy;
  if (!strategyDef) throw new Error(`Unknown strategy: ${strategy}`);
  const phase = {
    index: undefined,
    strategyId: strategyDef.id,
    strategyName: strategyDef.name,
    family: strategyDef.family,
    reason,
    evidence: evidence || {},
    status: 'active',
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  return phase;
}

function attachPhase(trajectory, phase) {
  if (!trajectory) throw new Error('trajectory is required');
  if (trajectory.phases.length >= DEFAULT_MAX_PHASES) {
    throw new Error(`Trajectory has reached max phases (${DEFAULT_MAX_PHASES})`);
  }
  if (trajectory.currentPhaseIndex >= 0) {
    const current = trajectory.phases[trajectory.currentPhaseIndex];
    if (current && current.status === 'active') {
      current.status = 'completed';
      current.completedAt = new Date().toISOString();
    }
  }
  phase.index = trajectory.phases.length;
  trajectory.phases.push(phase);
  trajectory.currentPhaseIndex = phase.index;
  trajectory.updatedAt = new Date().toISOString();
  return trajectory;
}

function getCurrentPhase(trajectoryId) {
  const trajectory = getTrajectory(trajectoryId);
  if (!trajectory) return null;
  if (trajectory.currentPhaseIndex < 0) return null;
  return trajectory.phases[trajectory.currentPhaseIndex] || null;
}

function getTransitionHistory(trajectoryId) {
  const trajectory = getTrajectory(trajectoryId);
  if (!trajectory) return [];
  return trajectory.phases.map((phase, idx) => ({
    from: idx > 0 ? trajectory.phases[idx - 1].strategyId : null,
    to: phase.strategyId,
    reason: phase.reason,
    evidence: phase.evidence,
    timestamp: phase.startedAt,
    status: phase.status,
  }));
}

function completePhase(trajectoryId, status = 'completed') {
  const trajectory = getTrajectory(trajectoryId);
  if (!trajectory) throw new Error(`Trajectory not found: ${trajectoryId}`);
  const phase = getCurrentPhase(trajectoryId);
  if (!phase) throw new Error('No active phase to complete');
  phase.status = normalizePhaseStatus(status);
  phase.completedAt = new Date().toISOString();
  trajectory.updatedAt = new Date().toISOString();
  return trajectory;
}

function getTrajectory(trajectoryId) {
  if (!global.__strategyTrajectories) global.__strategyTrajectories = new Map();
  return global.__strategyTrajectories.get(trajectoryId) || null;
}

function saveTrajectory(trajectory) {
  if (!global.__strategyTrajectories) global.__strategyTrajectories = new Map();
  global.__strategyTrajectories.set(trajectory.id, trajectory);
  return trajectory;
}

function createTrajectory(missionId) {
  const trajectory = startTrajectory(missionId);
  return saveTrajectory(trajectory);
}

function appendPhase(ctx) {
  const trajectory = getTrajectory(ctx.trajectoryId);
  if (!trajectory) throw new Error(`Trajectory not found: ${ctx.trajectoryId}`);
  const phase = addPhase(ctx);
  return attachPhase(trajectory, phase);
}

module.exports = {
  startTrajectory,
  addPhase,
  getCurrentPhase,
  getTransitionHistory,
  completePhase,
  createTrajectory,
  appendPhase,
  getTrajectory,
  saveTrajectory,
};
