'use strict';

const assert = require('node:assert/strict');
const eligibility = require('../src/services/agow/plasticity/pathwayEligibilityService');

function verifiedUpdate(pathway, now) {
  return eligibility.updatePathway(pathway, { pathwayId: 'memory->verify', contextHash: 'debugging',
    success: true, evidenceStatus: 'verified', evidenceRefs: [`evidence-${now}`], reward: 0.8,
    positiveSurprise: 0.7, now });
}

let pathway = null;
pathway = verifiedUpdate(pathway, 100);
assert.equal(pathway.status, 'provisional');
assert(pathway.fastWeight > 0.5);
assert.equal(pathway.slowWeight, 0.5);
pathway = verifiedUpdate(pathway, 200);
pathway = verifiedUpdate(pathway, 300);
assert.equal(pathway.status, 'consolidating');
assert.equal(pathway.slowWeight, 0.5);
const blocked = eligibility.consolidate(pathway, { evidenceStatus: 'reported', now: 400 });
assert.equal(blocked.consolidated, false);
const consolidated = eligibility.consolidate(pathway, { evidenceStatus: 'verified', now: 400 });
assert.equal(consolidated.consolidated, true);
assert(consolidated.pathway.slowWeight > pathway.slowWeight);
assert.equal(consolidated.pathway.status, 'consolidated');
console.log('✅ AGOW fast/slow plasticity eligibility and validation passed');
