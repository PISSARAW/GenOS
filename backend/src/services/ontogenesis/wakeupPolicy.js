'use strict';

/**
 * Politique de réveil du contrôleur (ADR 0235 §7).
 * Pure : aucun E/S. PAUSED ne se réveille jamais seul ;
 * SLEEPING_RESOURCE exige une ressource stable ; les autres
 * attentes se réveillent sur événement explicite.
 */

const WAKE_EVENTS = ['git', 'worker_done', 'resource', 'deadline', 'user_reply', 'wake'];

function isWakeEvent(type) {
  return WAKE_EVENTS.includes(type);
}

function haltedReason(state) {
  if (state === 'PAUSED') return 'pause-manuelle';
  if (state === 'STOPPING') return 'arret-en-cours';
  if (state === 'STOPPED') return 'arrete';
  return null;
}

function resourceWake(event) {
  if (event.type !== 'resource') return { wake: false, reason: 'ressource-attendue' };
  if (!event.stable) return { wake: false, reason: 'ressource-instable' };
  return { wake: true };
}

function inputWake(event) {
  if (event.type !== 'user_reply') return { wake: false, reason: 'reponse-attendue' };
  return { wake: true };
}

function shouldWake(state, event) {
  if (!event || !isWakeEvent(event.type)) return { wake: false };
  const halted = haltedReason(state);
  if (halted) return { wake: false, reason: halted };
  if (state === 'SLEEPING_RESOURCE') return resourceWake(event);
  if (state === 'WAITING_INPUT') return inputWake(event);
  return { wake: true };
}

module.exports = { WAKE_EVENTS, shouldWake, isWakeEvent };
