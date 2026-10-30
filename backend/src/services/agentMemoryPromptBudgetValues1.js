'use strict';

function createSelectionValue1(__genosValueScope1) {
  return (__genosValueScope1.memories[__genosValueScope1.kind] || []).map((item, index) => ({
        ...item,
        _promptMemoryKey: `${__genosValueScope1.kind}:${index}`,
        similarityScore: (0, __genosValueScope1.Number)(item.similarityScore ?? item.similarity) || 0
      }));
}

module.exports = { createSelectionValue1 };
