/**
 * GenOS CLI Test Suite v2 — 10 missions via les binaires directs
 * Appelle les fichiers CLI comme le ferait un MCP en realite.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(REPO_ROOT, 'backend', 'bin');
const RESULTS = [];
const START_TIME = Date.now();

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function runCLI(name, scriptRelPath, args, timeoutMs = 60000, envOverrides = {}) {
  const scriptPath = path.join(BIN_DIR, scriptRelPath);
  log(`\n═══ ${name} ═══`);
  log(`  Script: ${scriptRelPath}`);
  log(`  Args: ${JSON.stringify(args)}`);

  const testStart = Date.now();
  return new Promise((resolve) => {
    const env = { ...process.env, ...envOverrides,
      GENOS_WORKSPACE_ROOT: REPO_ROOT,
      GENOS_DB_PATH: path.join(REPO_ROOT, 'backend', 'genos.db'),
      GENOS_ALLOWED_COMMANDS_JSON: '[]',
      GENOS_ALLOW_FILE_EDITS: 'false',
      GENOS_SILENT_UPDATES: 'true'
    };

    const child = spawn('node', [scriptPath, ...args], {
      cwd: REPO_ROOT,
      env,
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      const elapsed = Date.now() - testStart;
      log(`  [TIMEOUT] after ${elapsed}ms`);
      RESULTS.push({
        name, script: scriptRelPath, args: args.join(' '),
        status: 'timeout', elapsedMs: elapsed, success: false,
        error: 'Timeout',
        stdout: stdout.slice(0, 500),
        stderr: stderr.slice(0, 500)
      });
      resolve();
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      const elapsed = Date.now() - testStart;
      const success = code === 0;
      log(`  Exit: ${code} | ${elapsed}ms | ${success ? '✅' : '❌'}`);

      RESULTS.push({
        name, script: scriptRelPath, args: args.join(' '),
        status: timedOut ? 'timeout' : (code === 0 ? 'success' : `exit=${code}`),
        elapsedMs: elapsed, success,
        error: success ? null : (stderr.trim().slice(0, 300) || `Exit ${code}`),
        stdout: stdout.slice(0, 500),
        stderr: stderr.slice(0, 500)
      });
      resolve();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      log(`  [ERROR] ${err.message}`);
      RESULTS.push({
        name, script: scriptRelPath, args: args.join(' '),
        status: 'spawn_error', elapsedMs: Date.now() - testStart, success: false,
        error: err.message, stdout: '', stderr: err.message
      });
      resolve();
    });
  });
}

async function runAll() {
  // ── 1. Simple — Créer un agent (via genos-orchestrate direct)
  await runCLI(
    'MISSION 1 — Simple: Créer un agent',
    'genos-orchestrate.cjs',
    [JSON.stringify({
      action: 'orchestrate',
      task: 'Crée un agent GenOS nommé "TestBot" avec le rôle "test_agent"',
      executionBudget: { events: 5 },
      timeoutMs: 30000
    })],
    45000
  );

  // ── 2. Simple — Rapport de progression
  await runCLI(
    'MISSION 2 — Simple: Rapport progression',
    'orchestratorActions.cjs',
    [JSON.stringify({
      action: 'report_progress',
      orchestratorId: 'test-orch-001',
      phase: 'in_progress',
      message: 'Mission de test — rapport #1',
      progress_percent: 25,
      completed: false
    })],
    15000
  );

  // ── 3. Moyen — Changer stratégie
  await runCLI(
    'MISSION 3 — Moyen: Changer stratégie',
    'orchestratorActions.cjs',
    [JSON.stringify({
      action: 'change_strategy',
      orchestratorId: 'test-orch-001',
      need: 'software_engineering',
      reason: 'Besoin de développer une application web complète',
      max_cost_level: 'medium'
    })],
    15000
  );

  // ── 4. Moyen — État organisation
  await runCLI(
    'MISSION 4 — Moyen: État organisation',
    'orchestratorActions.cjs',
    [JSON.stringify({
      action: 'organization_state',
      orchestratorId: 'test-orch-001',
      requesterAgentId: 'test-worker-001'
    })],
    15000
  );

  // ── 5. Moyen — Dispatcher worker (développement web)
  await runCLI(
    'MISSION 5 — Moyen: Dispatch worker (HTML compteur)',
    'genos-orchestrate.cjs',
    [JSON.stringify({
      action: 'dispatch_worker',
      orchestratorId: 'test-orch-002',
      mission: 'Crée une page HTML simple avec un compteur incrémentiel en JavaScript vanilla',
      role: 'frontend_developer',
      executionBudget: { events: 10 },
      timeoutMs: 60000
    })],
    90000
  );

  // ── 6. Complexe — A-Team écriture
  await runCLI(
    'MISSION 6 — Complexe: A-Team article IA',
    'genos-orchestrate.cjs',
    [JSON.stringify({
      action: 'dispatch_team',
      orchestratorId: 'test-orch-003',
      project_goal: 'Écrire un article de blog de 1500 mots sur les tendances de l\'IA en 2026',
      subsystems: ['research', 'writing', 'editing'],
      assignedRoles: ['researcher', 'writer', 'editor'],
      executionBudget: { events: 20 },
      timeoutMs: 90000
    })],
    120000
  );

  // ── 7. Complexe — Trinity
  await runCLI(
    'MISSION 7 — Complexe: Trinity IA générative',
    'genos-orchestrate.cjs',
    [JSON.stringify({
      action: 'dispatch_trinity',
      orchestratorId: 'test-orch-004',
      mission: 'Analyser les avantages et inconvénients de l\'IA générative en ingénierie logicielle',
      executionBudget: { events: 30 },
      timeoutMs: 120000
    })],
    180000
  );

  // ── 8. Complexe — Biocénose
  await runCLI(
    'MISSION 8 — Complexe: Biocénose logicielle',
    'genos-orchestrate.cjs',
    [JSON.stringify({
      action: 'dispatch_biological',
      orchestratorId: 'test-orch-005',
      mission: 'Explorer les mécanismes de collaboration d\'une biocénose logicielle',
      mode: 'biocenose',
      executionBudget: { events: 25 },
      timeoutMs: 90000
    })],
    120000
  );

  // ── 9. NP-difficile — Primitive MCTS
  await runCLI(
    'MISSION 9 — NP-difficile: Primitive MCTS',
    'orchestratorActions.cjs',
    [JSON.stringify({
      action: 'execute_primitive',
      orchestratorId: 'test-orch-006',
      primitive: 'genos_strat_mcts_select',
      args: {
        task: 'Optimiser la structure d\'un arbre de décision pour un système de recommandation',
        max_iterations: 100
      },
      timeoutMs: 60000
    })],
    90000
  );

  // ── 10. Recherche scientifique — Merge Trinity
  await runCLI(
    'MISSION 10 — Recherche: Fusion Trinity',
    'orchestratorActions.cjs',
    [JSON.stringify({
      action: 'merge_trinity',
      orchestratorId: 'test-orch-007',
      missionId: 'trinity-research-001',
      threshold: 0.75,
      domain: 'software_engineering',
      worldReports: [
        { worldNumber: 1, role: 'thesis', outcome: 'success',
          claims: [{ statement: 'L\'IA générative améliore la productivité de 40% en codage', evidence: ['étude IEEE 2025'] }],
          tests: ['pass'] },
        { worldNumber: 2, role: 'antithesis', outcome: 'success',
          claims: [{ statement: 'L\'IA générative introduit des bugs subtils non détectés', evidence: ['paper ACM 2025'] }],
          tests: ['pass'] },
        { worldNumber: 3, role: 'synthesis', outcome: 'success',
          claims: [{ statement: 'L\'IA est bénéfique mais nécessite review humaine', evidence: ['méta-analyse'] }],
          tests: ['pass'] }
      ]
    })],
    30000
  );

  // ── Bonus CLI-1 — genos-ateam-audit
  await runCLI(
    'BONUS — genos-ateam-audit',
    'genos-ateam-audit.js',
    ['--mission', 'Dévelopez une application web complète en React'],
    15000
  );

  // ── Bonus CLI-2 — genos-recent-tasks
  await runCLI(
    'BONUS — genos-recent-tasks',
    'genos-recent-tasks.cjs',
    [],
    15000
  );

  // ── Rapport final ──────────────────────────
  log('\n\n════════════════════════════════════════════════');
  log('RAPPORT DE TEST — GenOS CLI v2 (binaires directs)');
  log(`Temps total: ${(Date.now() - START_TIME) / 1000} secondes`);
  log('════════════════════════════════════════════════\n');

  const total = RESULTS.length;
  const passed = RESULTS.filter(r => r.success).length;
  const failed = RESULTS.filter(r => !r.success).length;

  console.log(`Résultats: ${passed}/${total} réussis, ${failed} échecs\n`);

  RESULTS.forEach(r => {
    const icon = r.success ? '✅' : '❌';
    const time = r.elapsedMs ? `${r.elapsedMs}ms` : 'N/A';
    console.log(`${icon} ${r.name}`);
    console.log(`   Script: ${r.script} | Args: ${r.args || 'N/A'}`);
    console.log(`   Status: ${r.status} | Time: ${time}`);
    if (r.error) console.log(`   Error: ${r.error}`);
    if (r.stdout) console.log(`   STDOUT: ${r.stdout.trim().slice(0, 200) || '(vide)'}`);
    console.log('');
  });

  const reportPath = path.resolve(REPO_ROOT, 'cli-test-results-v2.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    total, passed, failed,
    durationMs: Date.now() - START_TIME,
    tests: RESULTS
  }, null, 2));

  console.log(`\nRapport: ${reportPath}`);

  if (passed === total) {
    console.log('\n🏆 VERDICT: TOUT VA BIEN');
  } else if (passed >= total * 0.5) {
    console.log('\n⚠️  VERDICT: FONCTIONNEL MAIS DEGRADE');
  } else {
    console.log('\n💀 VERDICT: CRITIQUEMENT DEGRADE');
  }
}

runAll().catch((err) => {
  console.error('FATAL:', err.stack || err.message);
  process.exit(1);
});
