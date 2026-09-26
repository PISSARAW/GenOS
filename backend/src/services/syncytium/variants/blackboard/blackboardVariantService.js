'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');

const EVENT_TYPES = new Set(['new_problem', 'new_evidence', 'request_verification', 'unresolved_dependency', 'result']);
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function createBlackboardVariantService(syncytium) {
  return {
    createBlackboardSession: (mission, options) => syncytium.createSession(mission, {
      ...options, schema: schemaService.compile({ schemaId: 'syncytium-blackboard-v1', fields: {
        events: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' }
      } })
    }),
    postProblem: (sessionId, request) => post({ sessionId, request, eventType: 'new_problem', syncytium }),
    postEvidence: (sessionId, request) => post({ sessionId, request, eventType: 'new_evidence', syncytium }),
    requestVerification: (sessionId, request) => post({ sessionId, request, eventType: 'request_verification', syncytium }),
    reportUnresolvedDependency: (sessionId, request) => post({ sessionId, request, eventType: 'unresolved_dependency', syncytium }),
    publishBlackboardResult: (sessionId, request) => post({ sessionId, request, eventType: 'result', syncytium }),
    readBlackboard: (sessionId, options) => read(sessionId, options, syncytium)
  };
}

async function post(context) {
  const { sessionId, eventType, request = {}, syncytium } = context;
  validateEvent(eventType, request);
  const createdAt = request.createdAt ?? Date.now();
  const event = {
    eventId: request.eventId || randomUUID(), eventType,
    objectType: request.objectType || eventType,
    priority: request.priority || 0,
    actorId: request.actorId, provenance: { actorId: request.actorId, nucleusId: request.nucleusId || null },
    payload: request.payload, respondsTo: request.respondsTo || null, createdAt,
    expiresAt: request.ttlMs ? createdAt + request.ttlMs : null
  };
  const result = await syncytium.applyOperation(sessionId, {
    opId: request.opId || randomUUID(), actorId: request.actorId,
    kind: { type: 'typed_field', key: 'events', action: 'add', value: event }
  }, request.options || {});
  return { ...result, event };
}

function validateEvent(eventType, request) {
  if (!EVENT_TYPES.has(eventType) || !request.actorId || !isRecord(request.payload)) {
    throw blackboardError('A blackboard event requires an actor and an object payload.');
  }
  validateEventTime(request);
  validateEventPriority(request.priority);
  validateEventTtl(request);
  validateEventType(request.objectType);
  if (request.respondsTo !== undefined && typeof request.respondsTo !== 'string') {
    throw blackboardError('Blackboard respondsTo must be an event identifier.');
  }
}

function validateEventTime(request) {
  if (request.createdAt !== undefined && !Number.isSafeInteger(request.createdAt)) {
    throw blackboardError('Blackboard createdAt must be an integer timestamp.');
  }
}

function validateEventPriority(priority) {
  if (priority !== undefined && (!Number.isSafeInteger(priority) || priority < 0 || priority > 100)) {
    throw blackboardError('Blackboard priority must be an integer from 0 to 100.');
  }
}

function validateEventTtl(request) {
  if (request.ttlMs !== undefined && (!Number.isSafeInteger(request.ttlMs) || request.ttlMs < 1 || request.ttlMs > MAX_TTL_MS)) {
    throw blackboardError('Blackboard ttlMs must be between 1 ms and 30 days.');
  }
  if (request.ttlMs && !Number.isSafeInteger((request.createdAt ?? Date.now()) + request.ttlMs)) {
    throw blackboardError('Blackboard expiration timestamp is outside the safe integer range.');
  }
}

function validateEventType(objectType) {
  if (objectType !== undefined && (typeof objectType !== 'string' || !objectType.trim())) {
    throw blackboardError('Blackboard objectType must be a non-empty string.');
  }
}

async function read(sessionId, options = {}, syncytium) {
  const snapshot = await syncytium.snapshot(sessionId, options);
  const events = snapshot.shared.sharedFields.events || [];
  const filter = options.eventType;
  if (filter && !EVENT_TYPES.has(filter)) throw blackboardError(`Unknown blackboard event type '${filter}'.`);
  const now = Number.isSafeInteger(options.now) ? options.now : Date.now();
  const visible = events.filter((event) => !event.expiresAt || event.expiresAt > now);
  const filtered = filter ? visible.filter((event) => event.eventType === filter) : visible;
  const resolved = new Set(visible.map((event) => event.respondsTo).filter(Boolean));
  const unresolvedQuestions = visible.filter(isOpenQuestion).filter((event) => !resolved.has(event.eventId));
  const priorityQueue = [...filtered].sort(comparePriority);
  return { ...snapshot, blackboard: filtered, priorityQueue, unresolvedQuestions };
}

function isOpenQuestion(event) {
  return ['new_problem', 'request_verification', 'unresolved_dependency'].includes(event.eventType);
}

function comparePriority(left, right) {
  return right.priority - left.priority || left.createdAt - right.createdAt || left.eventId.localeCompare(right.eventId);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function blackboardError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_BLACKBOARD_EVENT_INVALID' });
}

module.exports = { createBlackboardVariantService };
