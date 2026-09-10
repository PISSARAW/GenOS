/**
 * Workspace temporal diff: entries, normalization and summary.
 */

function countFiles(entries) {
  const fileCounts = new Map();
  for (const entry of entries) {
    const file = String(entry.file || 'unknown');
    fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
  }
  return fileCounts;
}

function coerceCount(entry, field) {
  const value = entry[field] == null ? 0 : Number(entry[field]);
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`Diff counts must be non-negative numbers for '${entry.file || 'unknown'}'.`);
  }
  return value;
}

function normalizeDiffEntry(entry, fileCounts) {
  const file = String(entry.file || 'unknown');
  const additions = coerceCount(entry, 'additions');
  const deletions = coerceCount(entry, 'deletions');
  return {
    ...entry,
    file,
    additions,
    deletions,
    collisionRisk: fileCounts.get(file) > 1 ? 'HIGH' : (entry.collisionRisk || 'UNKNOWN')
  };
}

function countCategory(entries, category) {
  return entries.filter((entry) => entry.category === category).length;
}

function summarizeDiff(entries, baseWorkspace, targetWorkspace) {
  return {
    baseBranch: baseWorkspace,
    targetBranch: targetWorkspace,
    diffGeneratedAt: new Date().toISOString(),
    totalFilesChanged: new Set(entries.map((entry) => entry.file)).size,
    totalAdditions: entries.reduce((acc, d) => acc + d.additions, 0),
    totalDeletions: entries.reduce((acc, d) => acc + d.deletions, 0),
    categories: {
      syntaxAdditions: countCategory(entries, 'Syntax Additions'),
      refactorings: countCategory(entries, 'Refactorings'),
      breakingApiChanges: countCategory(entries, 'Breaking API Changes'),
      documentation: countCategory(entries, 'Documentation')
    },
    churnHeatmap: entries.map((d) => ({ file: d.file, churnScore: d.additions + d.deletions, collisionRisk: d.collisionRisk })),
    diffEntries: entries,
    diffSummary: entries
  };
}

function diffWorkspaces(baseWorkspace = 'main', targetWorkspace = 'feature-branch', options = {}) {
  const entries = options.diffEntries || [];
  if (!Array.isArray(entries)) throw new TypeError('diffEntries must be an array.');
  const fileCounts = countFiles(entries);
  const diffEntries = entries.map((entry) => normalizeDiffEntry(entry, fileCounts));
  return summarizeDiff(diffEntries, baseWorkspace, targetWorkspace);
}

module.exports = {
  diffWorkspaces
};
