'use strict';

const immunePlane = require('../immune/holobiontImmunePlane');

async function validateInheritedSymbiont(input = {}) {
  const definition = input.symbiont.definition || input.symbiont.genome || input.symbiont;
  const serialized = JSON.stringify(definition);
  const review = await immunePlane.reviewSymbiontOutput({
    symbiontId: input.symbiont.id,
    claim: `Validate inherited symbiont definition: ${serialized}`,
    resultHash: input.contract.contractId,
    evidenceRefs: input.evidenceRefs,
    verifierId: input.actorId,
    riskScore: input.riskScore,
    selfVerified: false
  });
  return { allowed: review.allowed, review, definition };
}

module.exports = { validateInheritedSymbiont };
