'use strict';

function values(candidate, field) {
  return Array.isArray(candidate[field]) ? candidate[field].map((value) => String(value)) : [];
}

function compatibilityWith(candidate, selected) {
  const candidateInterfaces = new Set(values(candidate, 'interfaces'));
  if (!candidateInterfaces.size || !selected.length) return 0.5;
  const peerInterfaces = new Set(selected.flatMap((peer) => values(peer, 'interfaces')));
  const overlap = [...candidateInterfaces].filter((value) => peerInterfaces.has(value)).length;
  return Number((overlap / candidateInterfaces.size).toFixed(3));
}

module.exports = { compatibilityWith };
