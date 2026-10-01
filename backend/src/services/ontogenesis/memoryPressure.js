'use strict';

const os = require('os');

/**
 * Mesure et admission mémoire communes à tous les dispatchs (ADR 0235 §5).
 * Le Biome seul ne voit pas la pression Windows : on mesure la mémoire
 * physique libre, la part du superviseur et les réservations admises.
 * Seuils Normal / Contraint / Critique avec hystérésis contre
 * l'oscillation. Note : une limite de heap Node ne couvre ni les
 * enfants ni la mémoire native ; les Job Objects restent à étudier
 * pour borner les processus détenus sous Windows.
 */

const DEFAULT_THRESHOLDS = Object.freeze({ constrainedPct: 0.25, criticalPct: 0.12, recoverPct: 0.35 });

function toMb(bytes) {
  return Math.round(bytes / 1048576);
}

function sampleMemory(input) {
  const reservationsMb = (input && input.reservationsMb) || 0;
  const totalMb = toMb(os.totalmem());
  const freeMb = toMb(os.freemem());
  return {
    totalMb,
    freeMb,
    freePct: totalMb > 0 ? freeMb / totalMb : 0,
    supervisorMb: toMb(process.memoryUsage().rss),
    reservationsMb
  };
}

function thresholdsOf(options) {
  return Object.assign({}, DEFAULT_THRESHOLDS, (options && options.thresholds) || {});
}

function baseLevel(sample, options) {
  const thresholds = thresholdsOf(options);
  const reserveMb = (options && options.reserveMb) || 0;
  const availableMb = sample.freeMb - reserveMb - sample.reservationsMb;
  if (sample.freePct < thresholds.criticalPct || availableMb < 0) return 'critical';
  if (sample.freePct < thresholds.constrainedPct) return 'constrained';
  return 'normal';
}

function stabilizedLevel(base, sample, options) {
  const thresholds = thresholdsOf(options);
  const previous = options && options.previous;
  if (previous === 'critical' && base !== 'critical' && sample.freePct < thresholds.recoverPct) {
    return 'critical';
  }
  if (previous === 'constrained' && base === 'normal' && sample.freePct < thresholds.recoverPct) {
    return 'constrained';
  }
  return base;
}

function classifyLevel(sample, options) {
  return stabilizedLevel(baseLevel(sample, options), sample, options);
}

function availableOf(sample, options) {
  const reserveMb = (options && options.reserveMb) || 0;
  return sample.freeMb - reserveMb - sample.reservationsMb;
}

function admitWork(input) {
  const level = classifyLevel(input.sample, input.options);
  if (level === 'critical') return { admitted: false, level, reason: 'memoire-critique' };
  if (availableOf(input.sample, input.options) < input.estimateMb) {
    return { admitted: false, level, reason: 'enveloppe-insuffisante' };
  }
  return { admitted: true, level };
}

module.exports = { DEFAULT_THRESHOLDS, sampleMemory, classifyLevel, admitWork };
