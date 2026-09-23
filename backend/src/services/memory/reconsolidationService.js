/**
 * Reconsolidation Service
 * Updates existing memories with new context and handles contradictions.
 */

const crypto = require('crypto');

const CONTRADICTION_FLAG = 'contradicted';

function hasContradiction(memoryEntry, newEvidence) {
  if (!memoryEntry || !newEvidence) return false;
  const oldContent = String(memoryEntry.content || memoryEntry.observationOutput || '').toLowerCase();
  const newContent = String(newEvidence.content || newEvidence.observationOutput || '').toLowerCase();
  if (!oldContent || !newContent) return false;
  if (oldContent === newContent) return false;
  const oldOutcome = String(memoryEntry.status || memoryEntry.outcome || '').toLowerCase();
  const newOutcome = String(newEvidence.status || newEvidence.outcome || '').toLowerCase();
  if (oldOutcome && newOutcome && oldOutcome !== newOutcome) return true;
  return !oldContent.includes(newContent) && !newContent.includes(oldContent);
}

function reconsolidate(ctx) {
  const { agentId, trigger, memoryEntry } = ctx || {};
  if (!memoryEntry) return { updated: false, reason: 'no_memory_entry' };

  const updated = {
    ...memoryEntry,
    lastReconsolidatedAt: new Date().toISOString(),
    reconsolidationCount: (memoryEntry.reconsolidationCount || 0) + 1,
    reconsolidationTriggers: [...(memoryEntry.reconsolidationTriggers || []), trigger || 'unknown'],
    agentId: agentId || memoryEntry.agentId || null
  };

  if (memoryEntry.context) {
    updated.context = {
      ...memoryEntry.context,
      lastTrigger: trigger || 'unknown',
      reconsolidatedAt: new Date().toISOString()
    };
  }

  return {
    updated: true,
    memoryId: updated.id || null,
    trigger: trigger || 'unknown',
    entry: updated
  };
}

function handleContradiction(memoryEntry, newEvidence) {
  if (!memoryEntry || !newEvidence) {
    return { action: 'none', reason: 'missing_data' };
  }

  if (!hasContradiction(memoryEntry, newEvidence)) {
    return { action: 'none', reason: 'no_contradiction' };
  }

  const flagged = {
    ...memoryEntry,
    context: {
      ...(memoryEntry.context || {}),
      [CONTRADICTION_FLAG]: true,
      contradictedAt: new Date().toISOString(),
      contradictionEvidence: {
        newContent: newEvidence.content || newEvidence.observationOutput || '',
        newStatus: newEvidence.status || newEvidence.outcome || null
      }
    },
    status: CONTRADICTION_FLAG
  };

  return {
    action: 'flagged',
    memoryId: memoryEntry.id || null,
    flag: CONTRADICTION_FLAG,
    entry: flagged
  };
}

function mergeEvidence(memoryEntry, newEvidence) {
  if (!memoryEntry || !newEvidence) return memoryEntry;
  return {
    ...memoryEntry,
    ...newEvidence,
    id: memoryEntry.id,
    reconsolidationCount: (memoryEntry.reconsolidationCount || 0) + 1,
    lastReconsolidatedAt: new Date().toISOString()
  };
}

module.exports = {
  CONTRADICTION_FLAG,
  reconsolidate,
  handleContradiction,
  mergeEvidence
};
