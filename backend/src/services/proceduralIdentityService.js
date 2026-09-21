'use strict';

const crypto = require('crypto');

function canonicalStructure(organism) {
  if (!organism || !organism.structure) return '';
  const s = organism.structure;
  const nodes = Array.isArray(s.nodes)
    ? [...s.nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)))
    : [];
  const synapses = Array.isArray(s.synapses)
    ? [...s.synapses].sort((a, b) =>
        `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`)
      )
    : [];
  return JSON.stringify({
    nodes: nodes.map((n) => ({ id: n.id, type: n.type })),
    synapses: synapses.map((s) => ({ from: s.from, to: s.to, type: s.type })),
  });
}

function contentHash(organism) {
  const canonical = canonicalStructure(organism);
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function validateId(organism) {
  const computed = contentHash(organism);
  return {
    valid: organism?.metadata?.id === computed,
    expected: computed,
    actual: organism?.metadata?.id || null,
  };
}

function assignId(organism) {
  const hash = contentHash(organism);
  return {
    ...organism,
    metadata: {
      ...(organism.metadata || {}),
      id: hash,
    },
  };
}

function createOccurrenceId(prefix = 'occ') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function canonicalEpisode(episode) {
  return {
    trajectory: Array.isArray(episode.trajectory)
      ? episode.trajectory.map(String).sort()
      : [],
    outcome: String(episode.outcome || ''),
    context: episode.context || {},
  };
}

function episodeHash(episode) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalEpisode(episode)))
    .digest('hex')
    .slice(0, 12);
}

module.exports = {
  canonicalStructure,
  contentHash,
  validateId,
  assignId,
  createOccurrenceId,
  canonicalEpisode,
  episodeHash,
};
