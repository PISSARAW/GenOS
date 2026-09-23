'use strict';

/**
 * Daemon Receptor Registry — ADR 0034 D3.
 *
 * Table déterministe événement → réponse daemon. Ne duplique PAS
 * signalReceptorService : ce registre déclare la physiologie
 * daemon (quel signal mérite quelle activité), le Signal Plane
 * existant reste le transport.
 *
 * Pipeline : event → receptor → cheap update → wake policy →
 * LLM seulement si nécessaire (zero-text : interruption, pas substrat).
 *
 * Priorités : high = candidate LLM, medium = focused sensing,
 * low = persistence only.
 */

const DAEMON_EVENTS = [
  'TERRITORY_FILE_CHANGED',
  'TERRITORY_COMMIT',
  'TERRITORY_REF_CHANGED',
  'TEST_FAILED',
  'TEST_RECOVERED',
  'BUILD_FAILED',
  'AGENT_RUNTIME_STARTED',
  'AGENT_COMPLETED',
  'AGENT_FAILED',
  'ORCHESTRATOR_ENTERED',
  'ORCHESTRATOR_LEFT',
  'FINDING_CREATED',
  'FINDING_REINFORCED',
  'FINDING_REFUTED',
  'RESOURCE_ORPHANED',
  'KNOWLEDGE_STALE'
];

const RECEPTORS = {
  TERRITORY_FILE_CHANGED: { wakeActivity: 'FOCUSED', priority: 'medium', cheapUpdate: 'touch' },
  TERRITORY_COMMIT: { wakeActivity: 'FOCUSED', priority: 'medium', cheapUpdate: 'head' },
  TERRITORY_REF_CHANGED: { wakeActivity: 'FOCUSED', priority: 'medium', cheapUpdate: 'touch' },
  TEST_FAILED: { wakeActivity: 'FOCUSED', priority: 'high', cheapUpdate: 'touch' },
  TEST_RECOVERED: { wakeActivity: null, priority: 'low', cheapUpdate: 'touch' },
  BUILD_FAILED: { wakeActivity: 'FOCUSED', priority: 'high', cheapUpdate: 'touch' },
  AGENT_RUNTIME_STARTED: { wakeActivity: null, priority: 'low', cheapUpdate: 'touch' },
  AGENT_COMPLETED: { wakeActivity: null, priority: 'low', cheapUpdate: 'touch' },
  AGENT_FAILED: { wakeActivity: 'FOCUSED', priority: 'high', cheapUpdate: 'touch' },
  ORCHESTRATOR_ENTERED: { wakeActivity: 'FOCUSED', priority: 'medium', cheapUpdate: 'touch', handoffRequested: true },
  ORCHESTRATOR_LEFT: { wakeActivity: null, priority: 'low', cheapUpdate: 'touch' },
  FINDING_CREATED: { wakeActivity: 'FOCUSED', priority: 'medium', cheapUpdate: 'touch' },
  FINDING_REINFORCED: { wakeActivity: null, priority: 'low', cheapUpdate: 'touch' },
  FINDING_REFUTED: { wakeActivity: 'FOCUSED', priority: 'high', cheapUpdate: 'touch' },
  RESOURCE_ORPHANED: { wakeActivity: 'FOCUSED', priority: 'high', cheapUpdate: 'touch' },
  KNOWLEDGE_STALE: { wakeActivity: 'FOCUSED', priority: 'medium', cheapUpdate: 'touch' }
};

function listDaemonEvents() {
  return [...DAEMON_EVENTS];
}

function getReceptorFor(eventType) {
  return RECEPTORS[eventType] || null;
}

function isKnownEvent(eventType) {
  return DAEMON_EVENTS.includes(eventType);
}

module.exports = {
  DAEMON_EVENTS,
  RECEPTORS,
  listDaemonEvents,
  getReceptorFor,
  isKnownEvent
};
