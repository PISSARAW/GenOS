'use strict';

const { createHash } = require('node:crypto');

function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function random(seed) {
  let value = Number.parseInt(hash(seed).slice(0, 8), 16);
  return () => { value = (1664525 * value + 1013904223) >>> 0; return value / 4294967296; };
}

function corpus(seed, count = 16) {
  const next = random(seed);
  const plants = new Map();
  const cases = Array.from({ length: count }, (_, index) => {
    const caseId = `${seed}:${index}`;
    const targets = Array.from({ length: 24 }, () => 0.2 + 0.6 * next());
    const damagedGain = 0.35 + 0.4 * next();
    plants.set(caseId, { gainAt: (step) => step < 8 ? 1 : damagedGain, damagedGain });
    return { caseId, input: { targets, plantKey: caseId } };
  });
  return { cases, plants, oracleHash: hash([...plants].map(([key, value]) => [key, value.damagedGain])) };
}

function observation(options) {
  const gain = options.plant.gainAt(options.step);
  const output = gain * options.command;
  return { ref: `${options.caseId}:${options.step}`, output, target: options.target,
    observedGain: output / options.command, ...(options.controlled ? controlledProbe(options) : {}) };
}

function controlledProbe(options) {
  const next = random(`${options.caseId}:${options.step}:assignment`);
  const interventionOrder = next() < 0.5 ? [0, 0.5] : [0.5, 0];
  // Pure stateless plants give isolated copies with identical initial conditions.
  const outputs = new Map(interventionOrder.map((command) => [command, options.plant.gainAt(options.step) * command]));
  return { probeCommand: 0.5, probeOutput: outputs.get(0.5), controlOutput: outputs.get(0), interventionOrder };
}

module.exports = { corpus, observation, hash };
