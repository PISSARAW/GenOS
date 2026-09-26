'use strict';

const { randomUUID } = require('crypto');

const EXPERIENCE_FIELDS = [
  'missionSignature', 'problemProfile', 'modelProvider', 'availableCapabilities',
  'initialMorphology', 'morphologyHistory', 'variants', 'budget',
  'transitions', 'costs', 'latency', 'tokens', 'failures',
  'quality', 'evidenceQuality', 'finalOutcome', 'counterfactuals'
];

function createExperience(input = {}) {
  const experience = buildExperienceObject(input);
  const validation = validateExperience(experience);
  if (!validation.valid)
    throw new Error(`Invalid experience: ${validation.errors.join('; ')}`);
  return experience;
}

function buildExperienceObject(input) {
  return {
    experienceId: input.experienceId || randomUUID(),
    ...coreFields(input),
    ...morphologyFields(input),
    ...resourceFields(input),
    ...outcomeFields(input),
    timestamp: new Date().toISOString()
  };
}

function coreFields(input) {
  return {
    missionSignature: input.missionSignature || null,
    problemProfile: input.problemProfile || {},
    modelProvider: input.modelProvider || null
  };
}

function morphologyFields(input) {
  return {
    availableCapabilities: toArray(input.availableCapabilities),
    initialMorphology: input.initialMorphology || null,
    morphologyHistory: toArray(input.morphologyHistory),
    variants: input.variants || {}
  };
}

function resourceFields(input) {
  return {
    budget: input.budget || {},
    transitions: toArray(input.transitions),
    costs: input.costs || {},
    latency: input.latency || 0,
    tokens: input.tokens || 0,
    failures: input.failures || 0
  };
}

function outcomeFields(input) {
  return {
    quality: input.quality || 0,
    evidenceQuality: input.evidenceQuality || 0,
    finalOutcome: input.finalOutcome || null,
    counterfactuals: toArray(input.counterfactuals)
  };
}

function toArray(val) { return Array.isArray(val) ? [...val] : []; }

function validateExperience(experience) {
  const errors = [];
  if (!experience || typeof experience !== 'object')
    return { valid: false, errors: ['Experience must be an object'] };
  reqField({ obj: experience, field: 'missionSignature', msg: 'missionSignature is required', errors });
  reqField({ obj: experience, field: 'problemProfile', msg: 'problemProfile is required:object', errors });
  reqField({ obj: experience, field: 'initialMorphology', msg: 'initialMorphology is required', errors });
  reqField({ obj: experience, field: 'finalOutcome', msg: 'finalOutcome is required', errors });
  return { valid: errors.length === 0, errors };
}

function reqField(ctx) {
  const { obj, field, msg, errors } = ctx;
  const val = obj[field];
  if (!val) { errors.push(msg); return; }
  if (msg.endsWith(':object') && typeof val !== 'object')
    errors.push(`${field} must be an object`);
}

class MorphologyExperienceStore {
  constructor(opts = {}) {
    this.experiences = new Map();
    this.byMissionSignature = new Map();
    this.byTopology = new Map();
    this.maxSize = opts.maxSize || 10000;
  }

  add(experience) {
    const exp = this.ensureExperience(experience);
    this.store(exp);
    this.index(exp);
    this.evictIfNeeded();
    return exp.experienceId;
  }

  ensureExperience(experience) {
    return experience.experienceId ? experience : createExperience(experience);
  }

  store(exp) { this.experiences.set(exp.experienceId, exp); }
  index(exp) { this.indexByMission(exp); this.indexByTopology(exp); }

  indexByMission(exp) {
    if (!this.byMissionSignature.has(exp.missionSignature))
      this.byMissionSignature.set(exp.missionSignature, []);
    this.byMissionSignature.get(exp.missionSignature).push(exp.experienceId);
  }

  indexByTopology(exp) {
    const t = exp.initialMorphology?.topology || 'unknown';
    if (!this.byTopology.has(t)) this.byTopology.set(t, []);
    this.byTopology.get(t).push(exp.experienceId);
  }

  get(id) { return this.experiences.get(id); }

  getByMissionSignature(signature) { return this.getByIndex(this.byMissionSignature, signature); }
  getByTopology(topology) { return this.getByIndex(this.byTopology, topology); }

  getByIndex(index, key) {
    return (index.get(key) || []).map(id => this.experiences.get(id)).filter(Boolean);
  }

  getAll() { return Array.from(this.experiences.values()); }

  query(filter = {}) {
    let results = this.getAll();
    if (filter.topology) results = results.filter(e => e.initialMorphology?.topology === filter.topology);
    if (filter.variant) results = results.filter(e => e.initialMorphology?.variant === filter.variant);
    if (filter.minQuality !== undefined) results = results.filter(e => e.quality >= filter.minQuality);
    if (filter.maxCost !== undefined) results = results.filter(e => e.tokens <= filter.maxCost);
    if (filter.outcome) results = results.filter(e => e.finalOutcome === filter.outcome);
    if (filter.since) results = results.filter(e => new Date(e.timestamp) >= new Date(filter.since));
    return results;
  }

  getStats(topology = null) {
    const experiences = topology ? this.getByTopology(topology) : this.getAll();
    if (!experiences.length) return { count: 0 };
    return this.computeStats(experiences);
  }

  computeStats(experiences) {
    const tokens = experiences.map(e => e.tokens);
    const latency = experiences.map(e => e.latency);
    const quality = experiences.map(e => e.quality);
    const failures = experiences.filter(e => e.failures > 0).length;
    return {
      count: experiences.length,
      avgTokens: this.mean(tokens),
      avgLatency: this.mean(latency),
      avgQuality: this.mean(quality),
      failureRate: failures / experiences.length,
      byOutcome: this.groupByOutcome(experiences)
    };
  }

  mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

  groupByOutcome(experiences) {
    const groups = {};
    for (const e of experiences) {
      const key = e.finalOutcome || 'unknown';
      if (!groups[key]) groups[key] = { count: 0, avgQuality: 0, avgTokens: 0 };
      groups[key].count++;
      groups[key].avgQuality += e.quality;
      groups[key].avgTokens += e.tokens;
    }
    for (const g of Object.values(groups)) {
      g.avgQuality /= g.count;
      g.avgTokens /= g.count;
    }
    return groups;
  }

  evictIfNeeded() {
    if (this.experiences.size > this.maxSize) {
      const oldest = [...this.experiences.entries()]
        .sort((a, b) => new Date(a[1].timestamp) - new Date(b[1].timestamp))[0];
      this.experiences.delete(oldest[0]);
    }
  }

  toJSON() {
    return {
      experiences: this.getAll(),
      metadata: { count: this.experiences.size, maxSize: this.maxSize }
    };
  }
}

module.exports = {
  createExperience, validateExperience, MorphologyExperienceStore, EXPERIENCE_FIELDS
};
