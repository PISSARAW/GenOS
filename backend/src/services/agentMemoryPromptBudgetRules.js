'use strict';

function createSelection(context) {
  return (context.memories[context.kind] || []).map((item, index) => ({
        ...item,
        _promptMemoryKey: `${context.kind}:${index}`,
        similarityScore: context.Number(item.similarityScore ?? item.similarity) || 0
      }));
}

module.exports = { createSelection };
