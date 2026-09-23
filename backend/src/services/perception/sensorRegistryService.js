'use strict';

/**
 * SensorRegistry — registre canonique des capteurs GenOS (G1).
 * Chaque capteur décrit coût, latence, risque, capacités requises,
 * outils requis, schéma de sortie et qualité de preuve.
 */

const SENSORS = [
  { id: 'filesystem', domains: ['code', 'repo'], cost: 1, latency: 5, risk: 'low', requiredCapabilities: ['read'], requiredTools: ['vfs'], evidenceQuality: 0.8, informationType: 'structure' },
  { id: 'ast', domains: ['code'], cost: 2, latency: 10, risk: 'low', requiredCapabilities: ['read', 'parse'], requiredTools: ['ast'], evidenceQuality: 0.85, informationType: 'structure' },
  { id: 'git', domains: ['code', 'history'], cost: 2, latency: 15, risk: 'low', requiredCapabilities: ['read'], requiredTools: ['git'], evidenceQuality: 0.9, informationType: 'history' },
  { id: 'test', domains: ['code', 'runtime'], cost: 5, latency: 60, risk: 'medium', requiredCapabilities: ['execute'], requiredTools: ['test_runner'], evidenceQuality: 0.95, informationType: 'causal' },
  { id: 'runtime_log', domains: ['runtime'], cost: 3, latency: 20, risk: 'low', requiredCapabilities: ['observe'], requiredTools: ['logs'], evidenceQuality: 0.7, informationType: 'symptom' },
  { id: 'dependency', domains: ['code', 'supply'], cost: 2, latency: 15, risk: 'low', requiredCapabilities: ['read'], requiredTools: ['vfs'], evidenceQuality: 0.75, informationType: 'structure' },
  { id: 'daemon', domains: ['repo', 'runtime'], cost: 2, latency: 25, risk: 'low', requiredCapabilities: ['observe'], requiredTools: ['daemon_sense'], evidenceQuality: 0.7, informationType: 'background' },
  { id: 'web', domains: ['knowledge'], cost: 6, latency: 90, risk: 'medium', requiredCapabilities: ['network'], requiredTools: ['web_forage'], evidenceQuality: 0.6, informationType: 'external' },
  { id: 'computer_use', domains: ['ui', 'runtime'], cost: 10, latency: 120, risk: 'high', requiredCapabilities: ['actuate'], requiredTools: ['computer_use'], evidenceQuality: 0.65, informationType: 'interactive' }
];

function listSensors() {
  return SENSORS.map((s) => ({ ...s }));
}

function getSensor(sensorId) {
  return SENSORS.find((s) => s.id === sensorId) || null;
}

function sensorsFor(opts) {
  const o = opts || {};
  const caps = new Set(o.capabilities || []);
  const domain = o.domain || null;
  return SENSORS.filter((s) => sensorMatches(s, caps, domain));
}

function sensorMatches(sensor, caps, domain) {
  if (domain && !sensor.domains.includes(domain)) return false;
  if (caps.size === 0) return true;
  return sensor.requiredCapabilities.every((c) => caps.has(c));
}

module.exports = { SENSORS, listSensors, getSensor, sensorsFor };
