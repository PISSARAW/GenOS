'use strict';

/**
 * Graphe d'états unifié pour le cœur d'orchestration GenOS.
 * Relie : orchestrateur → mission → tâche → run → job → worker.
 * Contrat pur, sans E/S. La persistance vit dans les stores existants.
 */

const STATES = Object.freeze({
  ORCHESTRATOR: ['INIT', 'ACTIVE', 'DRAINING', 'STOPPED'],
  MISSION: ['CREATED', 'PLANNING', 'DISPATCHED', 'EXECUTING', 'VERIFYING', 'INTEGRATING', 'TERMINATED', 'FAILED'],
  TACHE: ['CREATED', 'ASSIGNED', 'RUNNING', 'VERIFIED', 'REJECTED', 'COMPLETED', 'FAILED'],
  RUN: ['PREPARED', 'STARTED', 'RUNNING', 'PAUSED', 'VERIFIED', 'REJECTED', 'COMPLETED', 'FAILED'],
  JOB: ['QUEUED', 'CLAIMED', 'RUNNING', 'RETRYING', 'DEAD_LETTER', 'COMPLETED', 'FAILED', 'CANCELLED'],
  WORKER: ['INCARNATED', 'BOUND', 'EXECUTING', 'EVIDENCE', 'SURVIVOR', 'RETIRED', 'TERMINATED']
});

const TRANSITIONS = {
  ORCHESTRATOR: {
    INIT: { activate: 'ACTIVE', stop: 'STOPPED' },
    ACTIVE: { drain: 'DRAINING', stop: 'STOPPED' },
    DRAINING: { stop: 'STOPPED' },
    STOPPED: {}
  },
  MISSION: {
    CREATED: { plan: 'PLANNING', terminate: 'TERMINATED', fail: 'FAILED' },
    PLANNING: { dispatch: 'DISPATCHED', replan: 'PLANNING', terminate: 'TERMINATED', fail: 'FAILED' },
    DISPATCHED: { execute: 'EXECUTING', replan: 'PLANNING', terminate: 'TERMINATED', fail: 'FAILED' },
    EXECUTING: { verify: 'VERIFYING', pause: 'PAUSED', terminate: 'TERMINATED', fail: 'FAILED' },
    VERIFYING: { integrate: 'INTEGRATING', replan: 'PLANNING', terminate: 'TERMINATED', fail: 'FAILED' },
    INTEGRATING: { complete: 'TERMINATED', replan: 'PLANNING', fail: 'FAILED' },
    PAUSED: { resume: 'EXECUTING', terminate: 'TERMINATED', fail: 'FAILED' },
    TERMINATED: {},
    FAILED: {}
  },
  TACHE: {
    CREATED: { assign: 'ASSIGNED', fail: 'FAILED' },
    ASSIGNED: { start: 'RUNNING', reject: 'REJECTED', fail: 'FAILED' },
    RUNNING: { verify: 'VERIFIED', reject: 'REJECTED', fail: 'FAILED' },
    VERIFIED: { complete: 'COMPLETED', reject: 'REJECTED' },
    REJECTED: {},
    COMPLETED: {},
    FAILED: {}
  },
  RUN: {
    PREPARED: { start: 'STARTED', fail: 'FAILED' },
    STARTED: { run: 'RUNNING', pause: 'PAUSED', fail: 'FAILED' },
    RUNNING: { verify: 'VERIFIED', pause: 'PAUSED', reject: 'REJECTED', fail: 'FAILED' },
    PAUSED: { resume: 'RUNNING', fail: 'FAILED' },
    VERIFIED: { complete: 'COMPLETED', reject: 'REJECTED' },
    REJECTED: {},
    COMPLETED: {},
    FAILED: {}
  },
  JOB: {
    QUEUED: { claim: 'CLAIMED', cancel: 'CANCELLED' },
    CLAIMED: { run: 'RUNNING', retry: 'RETRYING', dead_letter: 'DEAD_LETTER', fail: 'FAILED', cancel: 'CANCELLED' },
    RUNNING: { complete: 'COMPLETED', fail: 'FAILED', retry: 'RETRYING', dead_letter: 'DEAD_LETTER' },
    RETRYING: { claim: 'CLAIMED', dead_letter: 'DEAD_LETTER', fail: 'FAILED' },
    DEAD_LETTER: {},
    COMPLETED: {},
    FAILED: {},
    CANCELLED: {}
  },
  WORKER: {
    INCARNATED: { bind: 'BOUND', terminate: 'TERMINATED' },
    BOUND: { execute: 'EXECUTING', retire: 'RETIRED', terminate: 'TERMINATED' },
    EXECUTING: { evidence: 'EVIDENCE', retire: 'RETIRED', terminate: 'TERMINATED' },
    EVIDENCE: { survive: 'SURVIVOR', retire: 'RETIRED', terminate: 'TERMINATED' },
    SURVIVOR: { retire: 'RETIRED', terminate: 'TERMINATED' },
    RETIRED: {},
    TERMINATED: {}
  }
};

function initialState(kind) {
  const map = {
    orchestrateur: 'INIT',
    mission: 'CREATED',
    tache: 'CREATED',
    run: 'PREPARED',
    job: 'QUEUED',
    worker: 'INCARNATED'
  };
  return map[kind] || null;
}

function nextState(kind, current, event) {
  const kindStates = TRANSITIONS[kind.toUpperCase()];
  if (!kindStates) return null;
  const from = kindStates[current];
  if (!from) return null;
  return from[event] || null;
}

function allowedEvents(kind, current) {
  const kindStates = TRANSITIONS[kind.toUpperCase()];
  if (!kindStates) return [];
  const from = kindStates[current];
  if (!from) return [];
  return Object.keys(from);
}

function isTerminal(kind, state) {
  const terminal = {
    ORCHESTRATOR: ['STOPPED'],
    MISSION: ['TERMINATED', 'FAILED'],
    TACHE: ['REJECTED', 'COMPLETED', 'FAILED'],
    RUN: ['VERIFIED', 'REJECTED', 'COMPLETED', 'FAILED'],
    JOB: ['DEAD_LETTER', 'COMPLETED', 'FAILED', 'CANCELLED'],
    WORKER: ['RETIRED', 'TERMINATED']
  };
  return terminal[kind.toUpperCase()] && terminal[kind.toUpperCase()].includes(state);
}

function canTransition(kind, from, to) {
  const events = allowedEvents(kind, from);
  return events.some((event) => nextState(kind, from, event) === to);
}

module.exports = { STATES, TRANSITIONS, initialState, nextState, allowedEvents, isTerminal, canTransition };
