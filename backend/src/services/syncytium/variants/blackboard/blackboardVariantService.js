'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');

const EVENT_TYPES = new Set(['new_problem', 'new_evidence', 'request_verification', 'unresolved_dependency', 'result']);
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function createBlackboardVariantService(syncytium) {
  return {
    createBlackboardSession: (mission, options) => syncytium.createSession(mission, { ...options, schema: schemaService.compile({ schemaId: 'syncytium-blackboard-v1', fields: { events: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' } } }) }),
    postProblem: (sessionId, request) => postEvent({ sessionId, request, eventType: 'new_problem', syncytium }),
    postEvidence: (sessionId, request) => postEvent({ sessionId, request, eventType: 'new_evidence', syncytium }),
    requestVerification: (sessionId, request) => postEvent({ sessionId, request, eventType: 'request_verification', syncytium }),
    reportUnresolvedDependency: (sessionId, request) => postEvent({ sessionId, request, eventType: 'unresolved_dependency', syncytium }),
    publishBlackboardResult: (sessionId, request) => postResult({ sessionId, request, syncytium }),
    readBlackboard: (sessionId, options) => readView({ sessionId, options, syncytium }),
    readBlackboardHistory: (sessionId, options) => readHistory({ sessionId, options, syncytium })
  };
}

async function postEvent(ctx) {
  const { sessionId, eventType, request, syncytium } = ctx;
  validateEventInput(eventType, request);
  const event = buildEvent(eventType, request);
  if (event.respondsTo) await validateRespondsTo(syncytium, sessionId, request.options || {}, event.respondsTo);
  const result = await syncytium.applyOperation(sessionId, { opId: request.opId || randomUUID(), actorId: request.actorId, kind: { type: 'typed_field', key: 'events', action: 'add', value: event } }, request.options || {});
  return { ...result, event };
}

async function postResult(ctx) {
  const { sessionId, request, syncytium } = ctx;
  if (!request.respondsTo || typeof request.respondsTo !== 'string') throw blackboardError('A result event must reference a question event via respondsTo.');
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const events = snapshot.shared.sharedFields.events || [];
  const target = events.find(e => e.eventId === request.respondsTo);
  if (!target) throw blackboardError(`respondsTo references non-existent event: ${request.respondsTo}`);
  if (!['new_problem', 'request_verification', 'unresolved_dependency'].includes(target.eventType)) throw blackboardError('Result can only respond to question-type events');
  return postEvent({ sessionId, request: { ...request, eventType: 'result' }, eventType: 'result', syncytium });
}

function validateEventInput(eventType, request) {
  if (!EVENT_TYPES.has(eventType) || !request.actorId || !isRecord(request.payload)) throw blackboardError('A blackboard event requires an actor and an object payload.');
  if (request.createdAt !== undefined && !Number.isSafeInteger(request.createdAt)) throw blackboardError('Blackboard createdAt must be an integer timestamp.');
  if (request.priority !== undefined && (!Number.isSafeInteger(request.priority) || request.priority < 0 || request.priority > 100)) throw blackboardError('Blackboard priority must be an integer from 0 to 100.');
  if (request.ttlMs !== undefined && (!Number.isSafeInteger(request.ttlMs) || request.ttlMs < 1 || request.ttlMs > MAX_TTL_MS)) throw blackboardError('Blackboard ttlMs must be between 1 ms and 30 days.');
  if (request.ttlMs && !Number.isSafeInteger((request.createdAt ?? Date.now()) + request.ttlMs)) throw blackboardError('Blackboard expiration timestamp is outside the safe integer range.');
  if (request.objectType !== undefined && (typeof request.objectType !== 'string' || !request.objectType.trim())) throw blackboardError('Blackboard objectType must be a non-empty string.');
  if (request.respondsTo !== undefined && typeof request.respondsTo !== 'string') throw blackboardError('Blackboard respondsTo must be an event identifier.');
}

function buildEvent(eventType, request) {
  const createdAt = request.createdAt ?? Date.now();
  return { eventId: request.eventId || randomUUID(), eventType, objectType: request.objectType || eventType, priority: request.priority || 0, actorId: request.actorId, provenance: { actorId: request.actorId, nucleusId: request.nucleusId || null }, payload: request.payload, respondsTo: request.respondsTo || null, createdAt, expiresAt: request.ttlMs ? createdAt + request.ttlMs : null };
}

async function validateRespondsTo(syncytium, sessionId, options, respondsTo) {
  const snapshot = await syncytium.snapshot(sessionId, options);
  const events = snapshot.shared.sharedFields.events || [];
  const target = events.find(e => e.eventId === respondsTo);
  if (!target) throw blackboardError(`respondsTo references non-existent event: ${respondsTo}`);
  if (!['new_problem', 'request_verification', 'unresolved_dependency'].includes(target.eventType)) throw blackboardError('respondsTo must reference a question-type event');
}

async function readView(ctx) {
  const { sessionId, options, syncytium } = ctx;
  const readOptions = options || {};
  const snapshot = await syncytium.snapshot(sessionId, readOptions);
  const events = snapshot.shared.sharedFields.events || [];
  const filter = readOptions.eventType;
  if (filter && !EVENT_TYPES.has(filter)) throw blackboardError(`Unknown blackboard event type '${filter}'.`);
  const now = Number.isSafeInteger(readOptions.now) ? readOptions.now : Date.now();
  const visible = events.filter(e => !e.expiresAt || e.expiresAt > now);
  const filtered = filter ? visible.filter(e => e.eventType === filter) : visible;
  const resolved = new Set(visible.map(e => e.respondsTo).filter(Boolean));
  const unresolvedQuestions = visible.filter(isOpenQuestion).filter(e => !resolved.has(e.eventId));
  const priorityQueue = [...filtered].sort(comparePriority);
  return { ...snapshot, blackboard: filtered, priorityQueue, unresolvedQuestions };
}

async function readHistory(ctx) {
  const { sessionId, options, syncytium } = ctx;
  const readOptions = options || {};
  const snapshot = await syncytium.snapshot(sessionId, readOptions);
  const events = snapshot.shared.sharedFields.events || [];
  const filter = readOptions.eventType;
  if (filter && !EVENT_TYPES.has(filter)) throw blackboardError(`Unknown blackboard event type '${filter}'.`);
  const filtered = filter ? events.filter(e => e.eventType === filter) : events;
  const withRespondsTo = filtered.map(e => ({ ...e, isResolved: e.respondsTo ? events.some(ev => ev.eventId === e.respondsTo) : false }));
  return { ...snapshot, history: withRespondsTo, totalEvents: events.length };
}

function isOpenQuestion(event) { return ['new_problem', 'request_verification', 'unresolved_dependency'].includes(event.eventType); }
function comparePriority(l, r) { return r.priority - l.priority || l.createdAt - r.createdAt || l.eventId.localeCompare(r.eventId); }
function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function blackboardError(message) { return Object.assign(new Error(message), { code: 'SYNCYTIUM_BLACKBOARD_EVENT_INVALID' }); }

module.exports = { createBlackboardVariantService };
