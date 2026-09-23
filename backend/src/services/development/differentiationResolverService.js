'use strict';

/**
 * DifferentiationResolver (G11) : généraliste -> spécialiste selon niche.
 * Le DNA n'est pas modifié ; seule l'expression change.
 */

const { setDevelopmental } = require('./developmentalStateService');

function differentiate(opts) {
  const o = opts || {};
  if (!o.agentId || !o.niche) throw new Error('differentiate requires agentId+niche');
  const phenotype = `niche_${String(o.niche).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_specialist`;
  return setDevelopmental({
    agentId: o.agentId,
    patch: {
      stage: 'SPECIALIZED', potency: 0.2, specialization: 0.9,
      niche: o.niche, activeHoxProgram: o.hox || null,
      differentiationHistory: [{ niche: o.niche, phenotype, at: new Date().toISOString() }]
    }
  });
}

module.exports = { differentiate };
