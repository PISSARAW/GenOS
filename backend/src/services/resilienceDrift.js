const MAX_LEVENSHTEIN_LENGTH = 10000;

/**
 * Calculates normalized Levenshtein distance between two strings with O(min(M, N)) space
 */
function calculateLevenshtein(strA = '', strB = '') {
  const sA = (typeof strA === 'string' ? strA : String(strA || '')).slice(0, MAX_LEVENSHTEIN_LENGTH);
  const sB = (typeof strB === 'string' ? strB : String(strB || '')).slice(0, MAX_LEVENSHTEIN_LENGTH);
  let m = Math.min(sA.length, MAX_LEVENSHTEIN_LENGTH);
  let n = Math.min(sB.length, MAX_LEVENSHTEIN_LENGTH);
  if (m === 0) return n === 0 ? 0 : 1.0;
  if (n === 0) return 1.0;

  let a = sA;
  let b = sB;
  if (m < n) {
    a = sB;
    b = sA;
    m = Math.min(a.length, MAX_LEVENSHTEIN_LENGTH);
    n = Math.min(b.length, MAX_LEVENSHTEIN_LENGTH);
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
  const safeAncestor = typeof ancestorPrompt === 'string' ? ancestorPrompt : String(ancestorPrompt || '');
  const safeCurrent = typeof currentPrompt === 'string' ? currentPrompt : String(currentPrompt || '');
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
