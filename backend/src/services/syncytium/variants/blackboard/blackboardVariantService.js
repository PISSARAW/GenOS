'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');

const EVENT_TYPES = new Set(['new_problem', 'new_evidence', 'request_verification', 'unresolved_dependency', 'result']);

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
  const event = {
    eventId: request.eventId || randomUUID(), eventType,
    actorId: request.actorId, payload: request.payload,
    respondsTo: request.respondsTo || null, createdAt: request.createdAt || Date.now()
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
  if (request.createdAt !== undefined && !Number.isSafeInteger(request.createdAt)) {
    throw blackboardError('Blackboard createdAt must be an integer timestamp.');
  }
  if (request.respondsTo !== undefined && typeof request.respondsTo !== 'string') {
    throw blackboardError('Blackboard respondsTo must be an event identifier.');
  }
}

async function read(sessionId, options = {}, syncytium) {
  const snapshot = await syncytium.snapshot(sessionId, options);
  const events = snapshot.shared.sharedFields.events || [];
  const filter = options.eventType;
  if (filter && !EVENT_TYPES.has(filter)) throw blackboardError(`Unknown blackboard event type '${filter}'.`);
  return { ...snapshot, blackboard: filter ? events.filter((event) => event.eventType === filter) : events };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function blackboardError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_BLACKBOARD_EVENT_INVALID' });
}

module.exports = { createBlackboardVariantService };
