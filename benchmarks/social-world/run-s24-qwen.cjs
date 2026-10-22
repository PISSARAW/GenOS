'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'SocialWorldCampaignTestOnly-2026!';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDatabase, closeDatabase } = require('../../backend/src/db');
const relations = require('../../backend/src/services/crossAgentRelationalService');
const learning = require('../../backend/src/services/relationOutcomeLearningService');
const modelProvider = require('../../backend/src/services/modelProvider');

const MODEL = 'ollama://qwen2.5:14b';
const DOMAIN = 'navigation';
const SCOPE = { organizationId: 'socialworld-org', projectId: 'socialworld-project' };

function saveResult(result) {
  const dir = path.join(__dirname, 'campaigns', 'socialworld-qwen-20261022');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'S24-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

function parseAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Qwen did not return a JSON object.');
  const value = JSON.parse(match[0]);
  return { successCount: value.successCount, failureCount: value.failureCount,
    trust: Number(value.trust), decreasedAfterFailure: value.decreasedAfterFailure };
}

async function createWorld(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('socialworld-project', 'socialworld-org', 'SocialWorld')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('socialworld-space', 'SocialWorld', 'D:/GenOS/SocialWorld', 'socialworld-org', 'socialworld-project')");
  for (const id of ['agent-a', 'agent-b']) {
    await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, id, 'worker', 'idle', 'worker', 'socialworld-space']);
  }
  await relations.createRelation({ db, id: 's24-collaboration', sourceAgentId: 'agent-a', targetAgentId: 'agent-b',
    relationType: 'collaborator', relationClass: 'collaborative', ...SCOPE,
    metadata: { trustByDomain: {}, learningEvidence: {} } });
}

async function createEvaluation(db, id, score, verified) {
  const result = { verified, oracleRef: verified ? `oracle:${id}` : null };
  await db.run(`INSERT INTO evaluation_runs
    (id, benchmark, model_version, prompt_hash, config_hash, score, result_json, agent_id, organization_id, project_id)
    VALUES (?, ?, 'socialworld-fixture', ?, ?, ?, ?, 'agent-b', ?, ?)`,
  [id, `SocialWorld:${DOMAIN}`, `prompt:${id}`, `config:${id}`, score, JSON.stringify(result),
    SCOPE.organizationId, SCOPE.projectId]);
}

async function main() {
  const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 7;
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const startedAt = Date.now(); let db; let trajectory = []; let qwenResponse = null;
  try {
    db = await getDatabase(':memory:');
    await createWorld(db);
    for (const [index, score] of [1, 1, 0, 0, 0].entries()) {
      const evaluationRunId = `s24-eval-${index + 1}`;
      await createEvaluation(db, evaluationRunId, score, true);
      trajectory.push(await learning.recordEvaluationOutcome({ db, relationId: 's24-collaboration',
        evaluationRunId, domain: DOMAIN, ...SCOPE }));
    }
    await createEvaluation(db, 's24-unverified', 1, false);
    let unverifiedRejected = false;
    try { await learning.recordEvaluationOutcome({ db, relationId: 's24-collaboration',
      evaluationRunId: 's24-unverified', domain: DOMAIN, ...SCOPE }); }
    catch (error) { unverifiedRejected = error.code === 'RELATION_OUTCOME_UNVERIFIED'; }
    const beforeFailure = trajectory[1].trust;
    const final = trajectory[4];
    const expected = { successCount: 2, failureCount: 3, trust: 0.428571, decreasedAfterFailure: true };
    const observed = { successCount: final.successes, failureCount: final.failures,
      trust: final.trust, decreasedAfterFailure: final.trust < beforeFailure };
    const stored = await relations.getRelation({ db, id: 's24-collaboration' });
    const enginePass = JSON.stringify(observed) === JSON.stringify(expected)
      && unverifiedRejected && stored.metadata.trustByDomain[DOMAIN] === expected.trust
      && stored.metadata.learningEvidence[DOMAIN].length === 5;
    const response = await modelProvider.generate({ model: MODEL,
      prompt: ['Read the GenOS trust trajectory for one domain after two verified successes and three verified failures. Copy the final evidence counts, trust and direction of change. An unverified evaluation was rejected.',
        `Trajectory: ${JSON.stringify(trajectory.map((entry) => ({ successes: entry.successes, failures: entry.failures, trust: entry.trust })))}`,
        `Final: ${JSON.stringify(observed)}`,
        'Return ONLY valid JSON with successCount, failureCount, trust, and decreasedAfterFailure.'].join('\n\n'),
      seed, temperature: 0, enforceSchema: false, stream: false, maxTokens: 70, timeoutMs: 180000,
      organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, agentId: 'agent-a' });
    qwenResponse = response.text;
    const answer = parseAnswer(qwenResponse);
    const passed = enginePass && JSON.stringify(answer) === JSON.stringify(expected);
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S24', seed,
      status: passed ? 'pass' : 'fail', model: MODEL, sourceCommit, expected, observed,
      trajectory, unverifiedRejected, persistedRelation: stored, qwenResponse, answer,
      enginePass, verified: passed,
      oracle: 'domain trust is recomputed from scoped, oracle-linked binary evaluations and decreases after verified failures',
      humanInstructionsAfterSetup: 0, durationMs: Date.now() - startedAt };
    saveResult(result); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const result = { campaignId: 'socialworld-qwen-20261022', scenario: 'S24', seed,
      status: 'fail', model: MODEL, sourceCommit, error: error.stack || error.message,
      trajectory, qwenResponse, verified: false, durationMs: Date.now() - startedAt };
    saveResult(result); process.stderr.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = 1;
  } finally { if (db) await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
