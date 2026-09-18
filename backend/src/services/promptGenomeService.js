'use strict';

const crypto = require('crypto');

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function createGenome(basePrompt, options = {}) {
  const base = String(basePrompt || '').trim();
  if (!base) throw new Error('Prompt genome requires a base prompt.');
  return {
    base,
    baseHash: hash(base),
    role: options.role || null,
    constraints: Array.isArray(options.constraints) ? options.constraints : [],
    enhancers: [],
    repressors: [],
    contextRefs: [],
    evidenceRefs: [],
    version: 0
  };
}

function mutate(genome, mutation = {}) {
  const next = { ...genome, version: Number(genome.version || 0) + 1 };
  for (const field of ['constraints', 'enhancers', 'repressors', 'contextRefs', 'evidenceRefs']) {
    if (Array.isArray(mutation[field])) next[field] = [...new Set([...next[field], ...mutation[field]])];
  }
  return next;
}

function render(genome) {
  const sections = [genome.base, ...genome.constraints.map((item) => `CONSTRAINT:${item}`), ...genome.enhancers.map((item) => `ENHANCER:${item}`), ...genome.repressors.map((item) => `REPRESSOR:${item}`), ...genome.contextRefs.map((item) => `CONTEXT_REF:${item}`), ...genome.evidenceRefs.map((item) => `EVIDENCE_REF:${item}`)];
  return sections.join('\n');
}

module.exports = { createGenome, mutate, render, hash };
