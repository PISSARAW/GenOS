'use strict';

function apply(initial, revisions) {
  const judgments = new Map(initial.map((item) => [item.memberId, { ...item, judgment: { ...item.judgment } }]));
  for (const record of revisions || []) {
    const update = record.update || record;
    const item = judgments.get(update.memberId);
    if (!item) continue;
    item.judgment = { ...item.judgment, position: update.newPosition,
      evidenceRefs: [...new Set([...item.judgment.evidenceRefs, ...update.evidenceRefs])],
      reasonCodes: update.reasonCodes };
    if (record.probabilities) item.judgment.probabilities = record.probabilities;
    item.revisionId = update.updateId;
  }
  return [...judgments.values()];
}

module.exports = { apply };
