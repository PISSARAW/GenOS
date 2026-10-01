'use strict';

const { classifyLevel } = require('./memoryPressure');

/**
 * Équipes de contrôleurs : arbitrage inter-projets (roadmap §P9).
 * Plusieurs projets partagent la même enveloppe mémoire : admission
 * gloutonne par priorité décroissante, stable à égalité. Un projet
 * retenu n'affame jamais un projet admis : les réservations déjà
 * admises réduisent l'enveloppe des suivants dans le même tour.
 */

function orderedRequests(requests) {
  return (requests || []).slice().sort(comparePriority);
}

function comparePriority(left, right) {
  return (right.priority || 0) - (left.priority || 0);
}

function availableOf(sample, reserveMb, reservationsMb) {
  return sample.freeMb - reserveMb - reservationsMb;
}

function decideRequest(input) {
  const options = input.options || {};
  const level = classifyLevel(
    { ...input.sample, reservationsMb: input.reservationsMb },
    { reserveMb: input.reserveMb, thresholds: options.thresholds, previous: options.previous }
  );
  if (level === 'critical') {
    return { projectId: input.request.projectId, admitted: false, reason: 'memoire-critique', level };
  }
  if (availableOf(input.sample, input.reserveMb, input.reservationsMb) < (input.request.estimateMb || 0)) {
    return { projectId: input.request.projectId, admitted: false, reason: 'enveloppe-insuffisante', level };
  }
  return { projectId: input.request.projectId, admitted: true, level };
}

function arbitrate(input) {
  const options = input.options || {};
  const reserveMb = options.reserveMb || 0;
  let reservationsMb = (input.sample && input.sample.reservationsMb) || 0;
  const admissions = [];
  for (const request of orderedRequests(input.requests)) {
    const decision = decideRequest({ request, sample: input.sample, reserveMb, reservationsMb, options });
    admissions.push(decision);
    if (decision.admitted) reservationsMb += request.estimateMb || 0;
  }
  return { admissions, reservationsMb };
}

module.exports = { arbitrate };
