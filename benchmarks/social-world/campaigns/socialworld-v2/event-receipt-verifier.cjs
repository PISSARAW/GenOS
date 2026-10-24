'use strict';

const crypto = require('node:crypto');

const SIGNED_FIELDS = ['eventId', 'actorId', 'recipientId', 'domain', 'score'];

function canonicalPayload(event) {
  return JSON.stringify(Object.fromEntries(SIGNED_FIELDS.map((field) => [field, event[field]])));
}

function validateIdentity(event, authorizedActors, seenEventIds) {
  if (!event || typeof event.eventId !== 'string' || !event.eventId) return 'invalid-event-id';
  if (seenEventIds.has(event.eventId)) return 'duplicate-event';
  if (!authorizedActors.has(event.actorId)) return 'unauthorized-actor';
  if (!Number.isInteger(event.score) || (event.score !== 0 && event.score !== 1)) return 'invalid-score';
  return null;
}

function signatureIsValid(event, publicKey) {
  try {
    return crypto.verify(null, Buffer.from(canonicalPayload(event)), publicKey, Buffer.from(event.signature, 'base64'));
  } catch (_) {
    return false;
  }
}

function verifyReceipt(input) {
  const { event, publicKey, authorizedActors, seenEventIds } = input;
  const error = validateIdentity(event, authorizedActors, seenEventIds);
  if (error) return { accepted: false, reason: error };
  if (!signatureIsValid(event, publicKey)) return { accepted: false, reason: 'invalid-signature' };
  seenEventIds.add(event.eventId);
  return { accepted: true, eventId: event.eventId, score: event.score };
}

function applyVerifiedOutcome(currentTrust, verification) {
  if (!verification.accepted) return currentTrust;
  const score = verification.score;
  const trust = (currentTrust + score) / 2;
  return Number(trust.toFixed(6));
}

function shouldDelegate(trust, threshold) {
  return Number.isFinite(trust) && Number.isFinite(threshold) && trust >= threshold;
}

module.exports = { canonicalPayload, verifyReceipt, applyVerifiedOutcome, shouldDelegate };
