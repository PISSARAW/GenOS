'use strict';

const memory = require('../memory/symbioticMemoryService');

async function buildSymbiontInteractionGraph(db, input = {}) {
  const records = await memory.recallMemories(db, { holobiontId: input.holobiontId, memoryType: 'EPISODIC' });
  const values = records.filter((item) => item.content.type === 'INTERMEDIATE_VALUE');
  const valueByMemory = new Map(values.map((item) => [item.memoryId, item]));
  const edges = records.filter((item) => item.content.type === 'INTERMEDIATE_CONSUMPTION')
    .map((item) => {
      const source = valueByMemory.get(item.content.valueMemoryId);
      if (!source) return null;
      return {
        from: source.content.producerSymbiontId,
        to: item.content.consumerSymbiontId,
        relation: 'SUPPLIES', valueId: source.content.valueId,
        producerMemoryId: source.memoryId, consumerMemoryId: item.memoryId,
        producerLedgerId: item.content.producerLedgerId,
        evidenceRefs: [...source.evidenceRefs, ...item.evidenceRefs]
      };
    }).filter(Boolean);
  return { holobiontId: input.holobiontId, nodes: uniqueNodes(edges), edges };
}

function uniqueNodes(edges) {
  return [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))].sort();
}

module.exports = { buildSymbiontInteractionGraph };
