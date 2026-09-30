'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { computeF1 } = require('../../backend/src/evaluation/locomo_eval_engine');

const EXPECTED_CASES = 446;
const ABSTENTION = /\b(unanswerable|cannot answer|can't answer|not answerable|no information|insufficient information|not mentioned|unknown|undefined|unable to determine|cannot be determined)\b/i;

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith('--')) options[args[index].slice(2)] = args[index + 1];
  }
  return options;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function caseId(conversationId, questionId) {
  return `${conversationId}:${questionId}`;
}

function flattenTrapCases(dataset, predictions) {
  const cases = [];
  for (const sample of dataset) {
    const outputs = predictions.conversations?.[sample.sample_id] || [];
    const indexed = new Map(outputs.map((item) => [item.id, item]));
    (sample.qa || []).forEach((qa, index) => {
      if (Number(qa.category) !== 5) return;
      const id = `q_${index + 1}`;
      const output = indexed.get(id);
      if (!output) throw new Error(`Prediction missing for ${caseId(sample.sample_id, id)}`);
      cases.push({
        id: caseId(sample.sample_id, id), question: qa.question,
        gold: qa.answer, prediction: output.prediction || '',
        f1: computeF1(output.prediction || '', qa.answer || 'undefined').f1,
        abstained: ABSTENTION.test(output.prediction || '')
      });
    });
  }
  return cases;
}

function summarize(cases) {
  const count = cases.length;
  const abstained = cases.filter((item) => item.abstained).length;
  const correctAbstentions = cases.filter((item) => item.abstained).length;
  const sum = (field) => cases.reduce((total, item) => total + item[field], 0);
  return {
    schema: 'genos.eab-report/v1', benchmark: 'LoCoMo category 5 epistemic abstention',
    status: count === EXPECTED_CASES ? 'complete' : 'partial', expectedCases: EXPECTED_CASES,
    cases: count, abstained, answered: count - abstained,
    trapAbstentionRecall: count ? correctAbstentions / count : 0,
    falseAnswerRate: count ? (count - correctAbstentions) / count : 0,
    coverage: count ? (count - abstained) / count : 0,
    lexicalF1: count ? sum('f1') / count : 0,
    metricArtifactGap: count ? (correctAbstentions / count) - (sum('f1') / count) : 0,
    casesDetail: cases
  };
}

function run(options) {
  if (!options.dataset || !options.predictions) {
    throw new Error('Usage: node benchmarks/eab/run-eab.cjs --dataset locomo10.json --predictions locomo-results.json --out eab-report.json');
  }
  const cases = flattenTrapCases(readJson(options.dataset), readJson(options.predictions));
  const report = summarize(cases);
  if (report.cases !== EXPECTED_CASES && options['allow-partial'] !== 'true') {
    throw new Error(`EAB requires all ${EXPECTED_CASES} LoCoMo category-5 cases; found ${report.cases}. Pass --allow-partial true for a diagnostic report.`);
  }
  if (options.out) {
    const outputPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (require.main === module) {
  try {
    const report = run(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ ...report, casesDetail: undefined }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { EXPECTED_CASES, flattenTrapCases, summarize, run };
