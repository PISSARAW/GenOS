'use strict';

function retain(ecology, entry) {
  if (!entry.evidenceRefs?.length) return false;
  const archive = ecology.archive || [];
  const sameNiche = archive.filter(item => item.nicheId === entry.nicheId);
  if (sameNiche.some(item => dominates(item, entry))) return false;
  const retained = archive.filter(item => item.nicheId !== entry.nicheId || !dominates(entry, item));
  ecology.archive = [...retained.filter(item => item.id !== entry.id), structuredClone(entry)].slice(-500);
  return true;
}

function dominates(left, right) {
  const comparisons = [left.quality >= right.quality, left.novelty >= right.novelty,
    left.robustness >= right.robustness, left.cost <= right.cost];
  const strict = left.quality > right.quality || left.novelty > right.novelty
    || left.robustness > right.robustness || left.cost < right.cost;
  return comparisons.every(Boolean) && strict;
}

module.exports = { retain };
