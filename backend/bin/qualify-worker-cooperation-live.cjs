#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharedBudget = { tokens: 64000, costUsd: 1, latencyMs: 720000, events: 400 };

async function prepare(options) {
  if (!path.isAbsolute(options.root || '') || !/^ollama:\/\/.+/.test(options.model || '')) {
    throw new Error('An absolute new output directory and explicit ollama:// model are required.');
  }
  const endpoint = process.env.GENOS_OLLAMA_ENDPOINT || 'http://127.0.0.1:11434/api/chat';
  if (!/\/api\/chat\/?$/.test(new URL(endpoint).pathname)) throw new Error('Bounded Ollama context requires a native /api/chat endpoint.');
  const root = path.resolve(options.root);
  await fs.mkdir(root);
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'problem.json'), JSON.stringify({ values: [4, 9, 6, 3, 8], target: 17 }));
  await fs.writeFile(path.join(workspace, 'allocation.json'), JSON.stringify({ indices: [0, 1] }));
  const credentials = { GENOS_ADMIN_PASSWORD: crypto.randomBytes(24).toString('hex'),
    GENOS_EPISTEMIC_RECEIPT_SECRET: crypto.randomBytes(32).toString('hex'),
    GENOS_GVX_LEDGER_HMAC_SECRET: crypto.randomBytes(32).toString('hex') };
  await fs.mkdir(path.join(root, 'private'));
  await fs.writeFile(path.join(root, 'private/credentials.json'), JSON.stringify(credentials), { mode: 0o600 });
  Object.assign(process.env, { GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_PATH: path.join(root, 'live.sqlite'), GENOS_STUDIO_ROOT: path.join(root, 'studio'),
    GENOS_CAPSULE_ROOT: path.join(root, 'capsules'), GENOS_SNAPSHOT_ROOT: path.join(root, 'snapshots'),
    GENOS_WORKSPACES_ROOT: root, GENOS_DISABLE_WORKSPACE_GC: '1', GENOS_OLLAMA_ENDPOINT: endpoint, ...credentials });
  return { root, workspace };
}

async function qualify(options) {
  const locations = await prepare(options);
  const database = require('../src/db');
  const db = await database.getDatabase();
  const report = { schema: 'genos.worker-cooperation-live/v2', startedAt: new Date().toISOString(),
    model: options.model, stages: [], protocolCompleted: false, qualified: false, promoted: false,
    genosMissionQualified: false,
    scope: 'bounded_model_plan_and_model_workers_with_native_semantic_oracles_and_native_capsule_recovery',
    limits: { workerBudget: sharedBudget, plannerMaxOutputTokens: 512, modelTokens: 65024 },
    limitations: ['Controlled local incident and constrained role plan; no general autonomous decomposition claim.',
      'Qualification is the bounded protocol driver verdict; native root mission completion is not asserted.',
      'Recovery restores an isolated capsule; source promotion is not authorized.',
      'Tokens include all child runs and planning; provider USD costs do not measure local electricity or hardware.'] };
  const context = { ...locations, id: `live-cooperation-${crypto.randomUUID()}`, model: options.model,
    db, report, planningTokens: null,
    save: () => fs.writeFile(path.join(locations.root, 'report.json'), JSON.stringify(report, null, 2)) };
  try {
    const seeded = await require('../tests/helpers/workerCooperationRuntime.cjs').seed(db,
      { id: context.id, workspace: context.workspace, budget: sharedBudget });
    context.control = seeded.control;
    context.control.ctx.normalizedMission.executionBudget = sharedBudget;
    await require('../src/services/missionModelBudgetScope').bindParent(context.control.ctx);
    report.rootAgentId = context.id;
    report.parentRunId = context.control.run.id;
    await require('../tests/helpers/workerCooperationLiveProtocol.cjs').execute(context);
    const authority = await require('../src/services/missionEnvelopeAuthority').assertRun(db, {
      agentId: context.id, runId: context.control.run.id, mission: context.control.ctx.normalizedMission });
    report.controllerAuthority = { hash: authority.hash, checkedAt: new Date().toISOString(),
      expiresAt: authority.envelope.expiresAt };
    report.protocolCompleted = true;
  } catch (error) { report.error = { message: error.message, code: error.code || null,
    omegaExecution: error.omegaExecution || null }; }
  finally {
    try {
      report.shutdown = await require('../tests/helpers/workerCooperationShutdown.cjs').stop(db, context.id);
      report.resources = await require('../tests/helpers/workerCooperationLiveEvidence.cjs').accounting(db, context);
      report.failureEvents = await db.all(`SELECT event_type,detail,payload_json FROM telemetry_events
        WHERE agent_id IN (SELECT id FROM agents WHERE parent_agent_id=? OR id=?)
          AND event_type IN ('AGENT_FAILED','LOCAL_WORKER_FAILED','WORKER_RECOVERY_DISPATCH_FAILED') ORDER BY rowid`,
      context.id, context.id);
      report.qualified = report.protocolCompleted && report.shutdown.stopped
        && report.resources.modelTokens !== null && report.resources.modelTokens <= report.limits.modelTokens;
      await database.closeDatabase();
    } catch (error) {
      report.qualified = false;
      report.shutdownError = { message: error.message, code: error.code || null };
    }
    report.finishedAt = new Date().toISOString();
    report.elapsedMs = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
    await context.save();
  }
  return report;
}

async function main() {
  const report = await qualify(JSON.parse(await fs.readFile(path.resolve(process.argv[2]), 'utf8')));
  console.log(JSON.stringify({ qualified: report.qualified, resources: report.resources, error: report.error }));
  if (!report.qualified) process.exitCode = 1;
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { qualify };
