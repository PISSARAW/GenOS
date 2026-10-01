'use strict';

/**
 * Machine à états de l'Ontogenèse (ADR 0235).
 * Rôle : contrat pur, sans E/S. La persistance vit dans projectStore.
 * Pause manuelle persistante ; seul SLEEPING_RESOURCE autorise un réveil auto.
 */

const STATES = [
  'INITIALIZING',
  'PLANNING',
  'EXECUTING',
  'VERIFYING',
  'INTEGRATING',
  'SLEEPING_RESOURCE',
  'WAITING_INPUT',
  'IDLE',
  'PAUSED',
  'STOPPING',
  'STOPPED'
];

const TRANSITIONS = {
  INITIALIZING: { planned: 'PLANNING', paused: 'PAUSED', stopped: 'STOPPING' },
  PLANNING: { dispatch: 'EXECUTING', wait: 'WAITING_INPUT', idle: 'IDLE', resource: 'SLEEPING_RESOURCE', paused: 'PAUSED', stopped: 'STOPPING' },
  EXECUTING: { finished: 'VERIFYING', resource: 'SLEEPING_RESOURCE', paused: 'PAUSED', stopped: 'STOPPING' },
  VERIFYING: { passed: 'INTEGRATING', failed: 'PLANNING', resource: 'SLEEPING_RESOURCE', wait: 'WAITING_INPUT', paused: 'PAUSED', stopped: 'STOPPING' },
  INTEGRATING: { integrated: 'PLANNING', idle: 'IDLE', resource: 'SLEEPING_RESOURCE', wait: 'WAITING_INPUT', paused: 'PAUSED', stopped: 'STOPPING' },
  SLEEPING_RESOURCE: { recovered: 'PLANNING', paused: 'PAUSED', stopped: 'STOPPING' },
  WAITING_INPUT: { resumed: 'PLANNING', paused: 'PAUSED', stopped: 'STOPPING' },
  IDLE: { awakened: 'PLANNING', paused: 'PAUSED', stopped: 'STOPPING' },
  PAUSED: { resumed: 'PLANNING', stopped: 'STOPPING' },
  STOPPING: { done: 'STOPPED' },
  STOPPED: {}
};

function isValidState(value) {
  return STATES.includes(value);
}

function allowedEvents(value) {
  return Object.keys(TRANSITIONS[value] || {});
}

function nextState(current, event) {
  const table = TRANSITIONS[current] || {};
  return table[event] || null;
}

function canTransition(from, to) {
  const table = TRANSITIONS[from] || {};
  return Object.values(table).includes(to);
}

function allowsAutoWake(value) {
  return value === 'SLEEPING_RESOURCE';
}

module.exports = { STATES, TRANSITIONS, isValidState, allowedEvents, nextState, canTransition, allowsAutoWake };
