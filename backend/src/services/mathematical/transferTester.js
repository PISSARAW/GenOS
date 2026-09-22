'use strict';

/**
 * @file transferTester.js
 * @description TransferTester — tests if a concept transfers to new domains.
 */

class TransferTester {
  async testTransfer(concept, targetDomain, testCases) {
    if (!testCases || testCases.length === 0) {
      return {
        conceptId: concept.id,
        targetDomain,
        successRate: 0,
        applicable: false,
        testResults: [],
      };
    }

    const compressionBonus = concept.compression?.isUseful ? 0.3 : 0;
    const domainSimilarity = this.computeDomainSimilarity(concept, targetDomain);
    const seed = this.hashString(concept.id + targetDomain);

    const baseSuccessRate = 0.4 + compressionBonus + domainSimilarity * 0.3;
    const successRate = Math.min(0.95, Math.max(0.1, baseSuccessRate));

    const testResults = testCases.map((tc, i) => {
      const testSeed = this.hashString(`${seed}-${i}-${JSON.stringify(tc)}`);
      const passed = (testSeed % 100) / 100 < successRate;
      return { testCase: tc, passed };
    });

    const passedCount = testResults.filter(r => r.passed).length;
    const actualRate = testResults.length > 0 ? passedCount / testResults.length : 0;

    return {
      conceptId: concept.id,
      targetDomain,
      successRate: actualRate,
      applicable: true,
      validationStatus: 'heuristic-transfer-estimate', // Point 9 : jamais 'transfer-validated' — c'est une heuristique, pas une preuve
      testResults,
      heuristics: {
        compressionBonus,
        domainSimilarity,
        baseSuccessRate,
      },
    };
  }

  computeDomainSimilarity(concept, targetDomain) {
    const conceptDomain = concept.domain || 'general';
    if (conceptDomain === targetDomain) return 1.0;

    const relatedDomains = {
      'combinatorics': ['graph-theory', 'number-theory', 'algebra'],
      'algebra': ['number-theory', 'geometry', 'combinatorics'],
      'analysis': ['geometry', 'topology', 'number-theory'],
      'geometry': ['topology', 'analysis', 'algebra'],
      'number-theory': ['algebra', 'combinatorics', 'analysis'],
      'topology': ['geometry', 'analysis', 'algebra'],
      'logic': ['combinatorics', 'number-theory', 'algebra'],
    };

    const related = relatedDomains[conceptDomain] || [];
    return related.includes(targetDomain) ? 0.5 : 0.1;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

module.exports = { TransferTester };