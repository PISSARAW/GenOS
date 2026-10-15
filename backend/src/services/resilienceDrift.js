/**
 * Calculates normalized Levenshtein distance between two strings with O(min(M, N)) space
 */
function calculateLevenshtein(strA = '', strB = '') {
  const sA = typeof strA === 'string' ? strA : '';
  const sB = typeof strB === 'string' ? strB : '';
  let m = sA.length;
  let n = sB.length;
  if (m === 0) return Number(n !== 0);
  if (n === 0) return 1.0;

  let a = sA;
  let b = sB;
  if (m < n) {
    a = sB;
    b = sA;
    m = a.length;
    n = b.length;
  }

  let prevRow = new Int32Array(n + 1);
  let currRow = new Int32Array(n + 1);

  for (let j = 0; j <= n; j++) prevRow[j] = j;

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    const charA = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = charA === b.charCodeAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost
      );
    }
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  const rawDist = prevRow[n];
  const maxLen = Math.max(m, n);
  return Number((rawDist / maxLen).toFixed(4));
}

/**
 * Tracks prompt hypermutation drift against ancestral baseline
 */
function trackHypermutationDrift(ancestorPrompt, currentPrompt) {
  const safeAncestor = typeof ancestorPrompt === 'string' ? ancestorPrompt : '';
  const safeCurrent = typeof currentPrompt === 'string' ? currentPrompt : '';
  const driftScore = calculateLevenshtein(safeAncestor, safeCurrent);
  const safetyHorizonLimit = 0.35;
  const isSafe = driftScore <= safetyHorizonLimit;

  return {
    ancestorLength: safeAncestor.length,
    currentLength: safeCurrent.length,
    driftScore,
    safetyHorizonLimit,
    isSafe,
    status: isSafe ? 'STABLE' : 'MUTATION_DRIFT_EXCEEDED',
    actionRequired: isSafe ? 'NONE' : 'ROLLBACK_GENOME_MUTATION'
  };
}

module.exports = {
  calculateLevenshtein,
  trackHypermutationDrift
};
