'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_PROTOCOL = path.join(__dirname, 'protocol.json');

function parseArgs(argv) {
  const options = { protocol: DEFAULT_PROTOCOL, out: null, seed: '20261021', allowDirty: false };
  for (const token of argv) {
    if (token === '--allow-dirty') { options.allowDirty = true; continue; }
    const match = /^--(protocol|out|seed)=(.+)$/.exec(token);
    if (!match) throw coded(`Argument inconnu: ${token}`, 'REFLECTION_ARGUMENT_UNKNOWN');
    options[match[1]] = match[2];
  }
  return options;
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function gitState(rootDir) {
  const run = (args) => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
  return { commitSha: run(['rev-parse', 'HEAD']), dirty: run(['status', '--porcelain']).length > 0 };
}

function stableNumber(value) {
  return Number.parseInt(digest(value).slice(0, 8), 16);
}

function orderedModes(seed, missionId, replicate) {
  const modes = ['alone', 'genos'];
  return stableNumber(`${seed}:${missionId}:${replicate}`) % 2 ? modes.reverse() : modes;
}

function buildSchedule(protocol, seed) {
  const runs = [];
  for (const mission of protocol.missions) {
    for (let replicate = 1; replicate <= protocol.repetitions; replicate += 1) {
      for (const mode of orderedModes(seed, mission.id, replicate)) {
        const modeOffset = mode === 'genos' ? 0 : 1;
        const variant = mission.variants[(replicate - 1 + modeOffset) % mission.variants.length];
        runs.push(buildRun({ protocol, mission, variant, mode, replicate }));
      }
    }
  }
  return runs.map((run, index) => ({ ...run, sequence: index + 1 }));
}

function buildRun(job) {
  const pairId = `${job.mission.id}-r${job.replicate}`;
  const runId = `${pairId}-${job.mode}-${job.variant.id}`;
  const workflow = job.mode === 'genos' ? job.mission.genosWorkflow : job.mission.aloneWorkflow;
  return {
    schemaVersion: 1, runId, pairId, replicate: job.replicate, mode: job.mode,
    missionId: job.mission.id, missionLabel: job.mission.label, variantId: job.variant.id,
    prompt: job.variant.prompt, fixture: job.variant.fixture || null,
    oracleCommand: job.variant.oracleCommand || null,
    expectedPromotion: job.variant.expectedPromotion || null,
    workflow, budget: job.mission.budget, primaryMetric: job.mission.primaryMetric,
    status: 'pending', startedAt: null, endedAt: null,
    outcome: { taskSucceeded: null, evidenceValid: null, finalOutcome: 'inconclusive' },
    metrics: emptyMetrics(), promotionDecision: null, evidence: [], verifierReceipts: [], notes: ''
  };
}

function emptyMetrics() {
  return {
    tokens: null, cost: null, wallTimeMs: null, resolutionTimeMs: null,
    budgetOverrunTokens: null, iterations: null, toolCalls: null, retries: null,
    humanInterventions: null, monitoringTimeMs: null, unsupportedPromotions: null
  };
}

function writeCampaign(job) {
  fs.mkdirSync(path.join(job.outDir, 'run-records'), { recursive: true });
  const serialized = `${JSON.stringify(job.campaign, null, 2)}\n`;
  fs.writeFileSync(path.join(job.outDir, 'campaign.json'), serialized);
  for (const run of job.campaign.runs) {
    fs.writeFileSync(path.join(job.outDir, 'run-records', `${run.runId}.json`), `${JSON.stringify(run, null, 2)}\n`);
  }
}

function prepareCampaign(options = {}) {
  const protocolPath = path.resolve(options.protocol || DEFAULT_PROTOCOL);
  const protocolText = fs.readFileSync(protocolPath, 'utf8');
  const protocol = JSON.parse(protocolText);
  const state = options.gitState || gitState(ROOT);
  if (state.dirty && !options.allowDirty) throw coded('Le dépôt est sale; utiliser un checkout propre ou --allow-dirty pour un essai non confirmatoire.', 'REFLECTION_DIRTY_WORKTREE');
  const generatedAt = (options.clock || (() => new Date().toISOString()))();
  const outDir = path.resolve(options.out || defaultOutDir(generatedAt));
  const campaign = {
    schemaVersion: 1, protocolId: protocol.protocolId, protocolDigest: digest(protocolText),
    generatedAt, seed: String(options.seed || '20261021'), repository: { ...state },
    confirmatoryEligible: !state.dirty, runs: buildSchedule(protocol, String(options.seed || '20261021'))
  };
  writeCampaign({ outDir, campaign });
  return { outDir, campaign };
}

function defaultOutDir(generatedAt) {
  const stamp = generatedAt.replace(/[:.]/g, '-');
  return path.join(__dirname, 'results', `pilot-${stamp}`);
}

function coded(message, code) {
  return Object.assign(new Error(message), { code });
}

function main() {
  const prepared = prepareCampaign(parseArgs(process.argv.slice(2)));
  console.log(`Campagne préparée: ${prepared.outDir}`);
  console.log(`Essais: ${prepared.campaign.runs.length}`);
  console.log(`Éligible confirmatoire: ${prepared.campaign.confirmatoryEligible}`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`${error.code || 'REFLECTION_PREPARE_FAILED'}: ${error.message}`); process.exit(1); }
}

module.exports = { buildSchedule, prepareCampaign };
