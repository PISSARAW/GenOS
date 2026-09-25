'use strict';

const fs = require('fs');
const path = require('path');
const { analyzeMission } = require('../../backend/src/services/aTeamService');

const root = __dirname;
const cases = JSON.parse(fs.readFileSync(path.join(root, 'ateam-paraphrase-cases.json'), 'utf8'));
const outputRoot = path.resolve(process.env.GENOS_CAMPAIGN_OUTPUT_ROOT || path.join(root, '../../artifacts/topology-morphogenesis/ateam-composition-audit'));

function precisionRecall(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const correct = [...actualSet].filter((domain) => expectedSet.has(domain)).length;
  return {
    expectedCount: expectedSet.size,
    detectedCount: actualSet.size,
    precision: actualSet.size ? correct / actualSet.size : 0,
    recall: expectedSet.size ? correct / expectedSet.size : 0
  };
}

function stability(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 1;
}

function evaluatePrompt(prompt, expectedDomains) {
  const result = analyzeMission(prompt);
  return { detectedDomains: result.detectedDomains, coverageAgainstExpected: precisionRecall(expectedDomains, result.detectedDomains) };
}

function evaluateCase(testCase) {
  const keyworded = evaluatePrompt(testCase.keyworded, testCase.expectedDomains);
  const paraphrased = evaluatePrompt(testCase.paraphrased, testCase.expectedDomains);
  return { id: testCase.id, expectedDomains: testCase.expectedDomains, keyworded, paraphrased,
    domainSetJaccard: stability(keyworded.detectedDomains, paraphrased.detectedDomains) };
}

function main() {
  const report = { schemaVersion: 1, scope: 'lexical sensitivity audit; not a semantic quality oracle',
    generatedAt: new Date().toISOString(), cases: cases.pairs.map(evaluateCase) };
  fs.mkdirSync(outputRoot, { recursive: true });
  const outputFile = path.join(outputRoot, `ateam-audit-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
  process.stdout.write(`${outputFile}\n`);
}

if (require.main === module) main();

module.exports = { evaluateCase, precisionRecall, stability };
