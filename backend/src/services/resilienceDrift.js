/**
 * Calculates normalized Levenshtein distance between two strings with O(min(M, N)) space
 */
function calculateLevenshtein(strA = '', strB = '') {
  const sA = String(strA || '');
  const sB = String(strB || '');
  let m = sA.length;
  let n = sB.length;
  if (m === 0) return n === 0 ? 0 : 1.0;
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
  const driftScore = calculateLevenshtein(ancestorPrompt || '', currentPrompt || '');
  const safetyHorizonLimit = 0.35;
  const isSafe = driftScore <= safetyHorizonLimit;

  return {
    ancestorLength: ancestorPrompt ? ancestorPrompt.length : 0,
    currentLength: currentPrompt ? currentPrompt.length : 0,
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
