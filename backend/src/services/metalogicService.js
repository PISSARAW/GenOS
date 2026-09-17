'use strict';

function analyze({ theorem, premises = [], conclusion } = {}) {
  return { theorem: theorem || null, premises, conclusion: conclusion || null, status: 'conceptual-analysis', proofChecked: false, limitation: 'Aucune preuve générale n’est inférée automatiquement.', promotionEligible: false };
}
function analyzeSelfReference({ sentence } = {}) {
  const text = String(sentence || '');
  return { sentence: text, selfReferential: /soi-même|itself|sa propre vérité/i.test(text), truthStatus: 'undetermined', requiresMetaLanguage: true, promotionEligible: false };
}
module.exports = { analyze, analyzeSelfReference };
