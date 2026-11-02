'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { compileQualityContract, executeElevationLoop } = require('../../backend/src/services/qualityElevation/qualityElevationService');
const { digest } = require('../../backend/src/services/qualityElevation/qualityContract');
const { createOllamaAdapter } = require('./ollama_gqel_driver.cjs');
const BRIEF = `Rédige le scénario intégral en français du court-métrage dramatique « Le Dernier Sas ».
Dans une station orbitale de recherche, un sas endommagé et une fuite de pathogène menacent l’équipage.
Alain et Vera doivent décider qui ferme manuellement le sas depuis l’extérieur.
Établis pourquoi cette opération est nécessaire, pourquoi les alternatives échouent et pourquoi le retour est impossible.
Donne à chacun un intérêt propre, une peur qui influence une action et une manière de parler distincte.
Montre découverte, obstacles, décisions et fermeture : ne les remplace pas par des résumés.
La tension doit naître des actes. Ni note de qualité, ni autoéloge, ni victoire seulement déclarée.`;
function argumentsOf(argv) {
  const allowed = new Set(['model', 'judge-model', 'out', 'iterations', 'minutes', 'min-words', 'scenes', 'context', 'tokens', 'policy', 'brief']), out = {};
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (!match || !allowed.has(match[1])) throw new Error(`Unknown argument: ${arg}`);
    out[match[1]] = match[2];
  }
  return out;
}
function configFrom(args) {
  return { domain: 'creative_writing', policy: args.policy || 'balanced', mission: args.brief ? fs.readFileSync(args.brief, 'utf8') : BRIEF,
    maxIterations: Number(args.iterations || 4), targetMinutes: Number(args.minutes || 20), minBodyWords: Number(args['min-words'] || 1200),
    minSceneCount: Number(args.scenes || 6), maxSceneCount: 12, budgetMaxTokens: Number(args.tokens || 160000), maxCalls: 100,
    maxPromptChars: 48000, maxOutputTokens: 3500, maxDurationMs: 3600000, callTimeoutMs: 300000 };
}
function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temporary, file);
}
function createOutputDirectory(requested) {
  const directory = path.resolve(requested || path.join('artifacts', `gqel-v2-${Date.now()}`));
  fs.mkdirSync(path.dirname(directory), { recursive: true }); fs.mkdirSync(directory); return directory;
}
function persistVersions(directory, session) {
  for (const version of session.versions) {
    const file = path.join(directory, `V${version.version}.md`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, version.content, { encoding: 'utf8', flag: 'wx' });
    if (digest(fs.readFileSync(file, 'utf8')) !== version.digest) throw new Error('Persisted artifact hash differs.');
  }
}
function makeReviewers(contract, adapter, model) {
  return Array.from({ length: contract.critiques }, (_, index) => ({ id: `reader-${index + 1}`, model, dependencyGroup: model,
    focus: ['causalité et dramaturgie', 'continuité, connaissances et mise en scène', 'lecture contradictoire du brief'][index % 3],
    // Separate calls and contexts are NOT independent models.
    review: adapter }));
}
async function runWritingMission(argv = process.argv.slice(2)) {
  const args = argumentsOf(argv), contract = compileQualityContract(configFrom(args)), directory = createOutputDirectory(args.out);
  const model = args.model || 'llama3.1:8b', judgeModel = args['judge-model'] || model;
  const common = { contextSize: Number(args.context || 32768), url: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' };
  const generator = createOllamaAdapter({ ...common, model }), judge = createOllamaAdapter({ ...common, model: judgeModel });
  console.log(`GQEL V2 | author=${model} | reviewer=${judgeModel} | output=${directory}`);
  atomicJson(path.join(directory, 'contract.json'), contract);
  const result = await executeElevationLoop({ contract, generator, reviewers: makeReviewers(contract, judge, judgeModel),
    onCheckpoint: session => {
      persistVersions(directory, session); atomicJson(path.join(directory, `checkpoint-${session.events.length}.json`), session);
      console.log(`round=${session.rounds} calls=${session.budget.calls} tokens=${session.budget.tokens} status=${session.status}`);
    } });
  persistVersions(directory, result.session); atomicJson(path.join(directory, 'report.json'), result);
  if (result.bestVersion) fs.writeFileSync(path.join(directory, result.promoted ? 'screenplay.md' : 'candidate-not-accepted.md'), result.bestVersion.content, { flag: 'wx' });
  console.log(`Status=${result.finalStatus}; promoted=${result.promoted}; observed rubric delta=${result.observedRubricDelta ?? 'unknown'}`);
  console.log('No artistic gain or superiority over the model alone is claimed by this run.');
  if (result.terminalError) console.error(result.terminalError);
  return result;
}
if (require.main === module) runWritingMission().then(result => { process.exitCode = result.promoted ? 0 : 2; })
  .catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { runWritingMission, argumentsOf, atomicJson, persistVersions, BRIEF };
