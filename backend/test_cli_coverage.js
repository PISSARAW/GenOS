/**
 * GenOS Coverage Test Suite — 1 concept par entrée documentée
 * Appelle les binaires backend/bin/ directement (pas d'API HTTP).
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const BIN = path.join(REPO, 'backend', 'bin');
const RES = [];
const T0 = Date.now();

function log(m) { console.log(`[${new Date().toISOString()}] ${m}`); }

function run(name, script, args, ms = 45000) {
  const p = path.join(BIN, script);
  if (!fs.existsSync(p)) {
    RES.push({ name, script, status: 'skip_missing', ok: false, err: 'File missing: ' + script });
    log(`⏭  ${name} — SKIP (fichier: ${script})`);
    return;
  }
  log(`═══ ${name} (${script}) ═══`);
  const t0 = Date.now();
  return new Promise(r => {
    const child = spawn('node', [p, ...args], {
      cwd: REPO,
      timeout: ms,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GENOS_DB_PATH: path.join(REPO, 'backend', 'genos.db'), GENOS_WORKSPACE_ROOT: REPO, GENOS_SILENT_UPDATES: 'true', GENOS_ALLOWED_COMMANDS_JSON: '[]', GENOS_ALLOW_FILE_EDITS: 'false' }
    });
    let out = '', err = '';
    let to = false;
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());
    const timer = setTimeout(() => {
      to = true; child.kill('SIGTERM');
      RES.push({ name, script, args: args.join(' '), status: 'timeout', elapsed: Date.now() - t0, ok: false, err: 'Timeout' });
      log(`⏱  ${name} — TIMEOUT (${Date.now() - t0}ms)`);
      r();
    }, ms);
    child.on('close', (code) => {
      clearTimeout(timer);
      const ok = code === 0 && !to;
      const elapsed = Date.now() - t0;
      log(`${ok ? '✅' : '❌'}  ${name} — exit ${code ?? 'signal'} | ${elapsed}ms`);
      RES.push({ name, script, args: args.join(' '), status: to ? 'timeout' : (code === 0 ? 'success' : 'exit=' + code), elapsed, ok, err: ok ? null : (err.trim().slice(0, 200) || 'exit ' + code), out: out.slice(0, 300), errOut: err.slice(0, 200) });
      r();
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      log(`💥  ${name} — SPAWN ERROR: ${e.message}`);
      RES.push({ name, script, status: 'spawn_error', elapsed: Date.now() - t0, ok: false, err: e.message });
      r();
    });
  });
}

async function main() {
  // ── 1. DÉCOUVERTE ──
  await run('CLI-01 [Discovery] cliHelp --help', 'cliHelp.cjs', ['--help'], 10000);
  await run('CLI-02 [Discovery] orchestrate --help', 'genos-orchestrate.cjs', ['--help'], 10000);
  await run('CLI-03 [Discovery] actions --help', 'orchestratorActions.cjs', ['--help'], 10000);
  await run('CLI-04 [Discovery] ateam-audit --help', 'genos-ateam-audit.js', ['--help'], 10000);
  await run('CLI-05 [Discovery] apoptosis --help', 'genos-apoptosis.cjs', ['--help'], 10000);

  // ── 2. UTILITAIRES ──
  await run('UTIL-01 [Util] genos-recent-tasks', 'genos-recent-tasks.cjs', [], 10000);
  await run('UTIL-02 [Audit] ateam-audit --mission simple', 'genos-ateam-audit.js', ['--mission', 'Construis une app React'], 10000);
  await run('UTIL-03 [Audit] ateam-audit --mission complexe', 'genos-ateam-audit.js', ['--mission', 'Construis une app full-stack avec auth OAuth, API et tests'], 10000);

  // ── 3. ORCHESTRATION ──
  await run('ORCH-01 [Orch] orchestrate simple', 'genos-orchestrate.cjs',
    [JSON.stringify({ action: 'orchestrate', task: 'Écris un script Python quicksort', executionBudget: { events: 5 }, timeoutMs: 30000 })], 45000);

  await run('ORCH-02 [Orch] orchestrate basique sans budget', 'genos-orchestrate.cjs',
    [JSON.stringify({ action: 'orchestrate', task: 'Liste 5 nombres premiers', timeoutMs: 60000 })], 90000);

  // ── 4. ACTIONS GRANULAIRES ──
  const oid = `orch-${Date.now()}`;
  await run('ACT-01 [Action] report_progress', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'report_progress', orchestratorId: oid, phase: 'in_progress', message: 'Phase 2/5', progress_percent: 40, completed: false })], 15000);

  await run('ACT-02 [Action] change_strategy', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'change_strategy', orchestratorId: oid, need: 'security_review', reason: 'Vulnérabilité OAuth découverte', max_cost_level: 'high' })], 15000);

  await run('ACT-03 [Action] change_organization', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'change_organization', orchestratorId: oid, organization: 'specialist_expert_committee', reason: 'Besoin d\'experts multidisciplinaires' })], 15000);

  await run('ACT-04 [Action] organization_state', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'organization_state', orchestratorId: oid, requesterAgentId: 'test-agent-001' })], 15000);

  await run('ACT-05 [Action] organization_inbox', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'organization_inbox', orchestratorId: oid, requesterAgentId: 'test-agent-001', limit: 5 })], 15000);

  await run('ACT-06 [Action] organization_publish', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'organization_publish', orchestratorId: oid, senderAgentId: 'test-agent-002', recipientAgentId: 'test-agent-001', kind: 'evidence', content: 'Analyse terminée' })], 15000);

  // ── 5. PRIMITIVES ──
  await run('PRI-01 [Primitive] snapshot', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'snapshot', args: { agentId: 'test-w', workspaceId: 'ws-test' } })], 30000);

  await run('PRI-02 [Primitive] compile_memory', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'compile_memory', args: { agentId: 'test-w', task: 'Synthétiser les expériences' } })], 30000);

  await run('PRI-03 [Primitive] evaluate', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'evaluate', args: { agentId: 'test-w', task: 'Évaluer la solution', reply: 'Solution: API REST JWT' } })], 30000);

  await run('PRI-04 [Primitive] stdp_update', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'stdp_update', args: { agentId: 'test-w', orchestratorId: oid, task: 'Mettre à jour les synapses' } })], 30000);

  await run('PRI-05 [Primitive] search_memory', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'search_memory', args: { agentId: 'test-w', task: 'Rechercher échecs similaires' } })], 30000);

  await run('PRI-06 [Primitive] mcts_select (MCTS)', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'mcts_select', args: { agentId: 'test-w', task: 'Sélectionner la meilleure branche', max_iterations: 50 } })], 60000);

  await run('PRI-07 [Primitive] fork', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'fork', args: { agentId: 'test-w', task: 'Brancher un worker isolé' } })], 30000);

  await run('PRI-08 [Primitive] safe_revert', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'safe_revert', args: { agentId: 'test-w', snapshotId: 'snap-001' } })], 30000);

  await run('PRI-09 [Primitive] bisect_agent', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'bisect_agent', args: { agentId: 'test-w', task: 'Bisser une régression' } })], 30000);

  await run('PRI-10 [Primitive] verify', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'verify', args: { agentId: 'test-w', task: 'Vérifier la solution' } })], 30000);

  await run('PRI-11 [Primitive] search_failures', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'search_failures', args: { agentId: 'test-w', task: 'Cherche les échecs passés' } })], 30000);

  await run('PRI-12 [Primitive] cherry_pick_golden_path', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'cherry_pick_golden_path', args: { agentId: 'test-w', task: 'Synthétiser le chemin doré' } })], 30000);

  await run('PRI-13 [Primitive] mutate', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'mutate', args: { agentId: 'test-w', task: 'Proposer une variante' } })], 30000);

  await run('PRI-14 [Primitive] select', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'select', args: { agentId: 'test-w', candidates: ['a', 'b', 'c'] } })], 30000);

  await run('PRI-15 [Primitive] breed', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'breed', args: { agentId: 'test-w', parent1: 'solA', parent2: 'solB' } })], 30000);

  await run('PRI-16 [Primitive] pareto_select', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'pareto_select', args: { agentId: 'test-w', candidates: ['a', 'b', 'c'] } })], 30000);

  await run('PRI-17 [Primitive] apoptosis', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'apoptosis', args: { agentId: 'test-w', reason: 'Divergence cognitive' } })], 30000);

  await run('PRI-18 [Primitive] quarantine', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'quarantine', args: { agentId: 'test-w', target: 'worker-suspect' } })], 30000);

  await run('PRI-19 [Primitive] quorum', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'quorum', args: { agentId: 'test-w', proposals: ['p1', 'p2', 'p3'], threshold: 0.6 } })], 30000);

  await run('PRI-20 [Primitive] pheromone_deposit', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'pheromone_deposit', args: { agentId: 'test-w', path: 'solution_A', strength: 0.8 } })], 30000);

  await run('PRI-21 [Primitive] causal_replay', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'causal_replay', args: { agentId: 'test-w', trajectoryId: 'traj-001' } })], 30000);

  await run('PRI-22 [Primitive] replay', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'execute_primitive', orchestratorId: oid, primitive: 'replay', args: { agentId: 'test-w', snapshotId: 'snap-002' } })], 30000);

  // ── 6. DISPATCH WORKER ──
  await run('WRK-01 [Worker] dispatch_worker HTML', 'genos-orchestrate.cjs',
    [JSON.stringify({ action: 'dispatch_worker', orchestratorId: `orch-${Date.now()}`, mission: 'Crée une page HTML avec compteur incrémentiel JS vanilla', role: 'frontend_developer', executionBudget: { events: 10 }, timeoutMs: 60000 })], 90000);

  await run('WRK-02 [Worker] dispatch_worker restreint', 'genos-orchestrate.cjs',
    [JSON.stringify({ action: 'dispatch_worker', orchestratorId: `orch-${Date.now()}`, mission: 'Résume le fichier README.md', role: 'analyst', executionPolicy: { allowedCommands: ['cat', 'head', 'tail'], allowFileEdits: false }, executionBudget: { events: 8 }, timeoutMs: 60000 })], 90000);

  // ── 7. A-TEAM ──
  await run('ATEAM-01 [A-Team] 3 domaines (frontend/backend/security)', 'genos-orchestrate.cjs',
    [JSON.stringify({ action: 'dispatch_team', orchestratorId: `orch-${Date.now()}`, project_goal: 'Construis interface React + API Express + OAuth sécurisé avec tests', subsystems: ['frontend', 'backend', 'security'], assignedRoles: ['frontend_engineer', 'backend_engineer', 'security_reviewer'], executionBudget: { events: 30 }, timeoutMs: 90000 })], 120000);

  await run('ATEAM-02 [A-Team] fiction créative', 'genos-orchestrate.cjs',
    [JSON.stringify({ action: 'dispatch_team', orchestratorId: `orch-${Date.now()}`, project_goal: 'Écris une nouvelle SF sur une IA découvrant l\'empathie', subsystems: ['creative_writing', 'editing', 'critique'], assignedRoles: ['literary_author', 'editor', 'literary_critic'], executionBudget: { events: 25 }, timeoutMs: 90000 })], 120000);

  // ── 8. TRINITY ──
  await run('TRIN-01 [Trinity] 3 mondes parallèles', 'genos-orchestrate.cjs',
    [JSON.stringify({ action: 'dispatch_trinity', orchestratorId: `orch-${Date.now()}`, mission: 'Implémente un système de recommandation films', executionBudget: { events: 30 }, timeoutMs: 120000 })], 180000);

  await run('TRIN-02 [Trinity] merge_trinity', 'orchestratorActions.cjs',
    [JSON.stringify({ action: 'merge_trinity', orchestratorId: `orch-${Date.now()}`, missionId: 'trinity-merge-001', threshold: 0.75, domain: 'software_engineering', worldReports: [
      { worldNumber: 1, role: 'basic', outcome: 'success', claims: [{ statement: 'Filtrage collaboratif direct', evidence: ['test'] }], tests: ['pass'] },
      { worldNumber: 2, role: 'planned', outcome: 'success', claims: [{ statement: 'Couches + matrice dépendances', evidence: ['audit'] }], tests: ['pass'] },
      { worldNumber: 3, role: 'self_correcting', outcome: 'success', claims: [{ statement: 'Tests robustesse + itératif', evidence: ['validation'] }], tests: ['pass'] }
    ] })], 30000);

  // ── 9. BIOLOGICAL MODES ──
  await run('BIO-01 [Biocénose] 4 rôles communautaires', 'genos-orchestrate.cjs',
    [JSON.stringify({ action: 'dispatch_biological', orchestratorId: `orch-${Date.now()}`, mission: 'Concevoir architecture distribuée résiliente', mode: 'biocenose', executionBudget: { events: 25 }, timeoutMs: 90000 })], 120000);

  await run('BIOME-01 [Biome] 4 rôles environnement', 'genos-orchestrate.cjs',
    [JSON.stringify({ action: 'dispatch_biological', orchestratorId: `orch-${Date.now()}`, mission: 'Platfrome e-commerce: front, back, paiement, logistique', mode: 'biome', executionBudget: { events: 25 }, timeoutMs: 90000 })], 120000);

  // ── 10. DAEMON & APOPTOSIS ──
  await run('DAEM-01 [Daemon] --status', 'genos-daemon.cjs', ['--status'], 15000);
  await run('APOP-01 [Apoptosis] kill switch agents actifs', 'genos-apoptosis.cjs', [], 20000);
  await run('COMP-01 [Computer-Use] automatisation bureau', 'genos-computer-use.cjs', ['Test: ouvre un éditeur texte et écrire "Hello GenOS"'], 60000);

  // ── Rapport ──
  log('\n\n════════════════════════════════════════════════════');
  log('RAPPORT COUVERTURE — GenOS (par concept documenté)');
  log(`Temps: ${(Date.now() - T0) / 1000}s | Tests: ${RES.length}`);
  log('════════════════════════════════════════════════════\n');

  const total = RES.length;
  const passed = RES.filter(r => r.ok).length;
  const failed = RES.filter(r => !r.ok && r.status !== 'skip_missing' && r.status !== 'skip_not_implemented').length;
  const skipped = RES.filter(r => r.status === 'skip_missing' || r.status === 'skip_not_implemented').length;

  console.log(`TOTAL: ${total} | ✅: ${passed} | ❌: ${failed} | ⏭: ${skipped}`);

  RES.forEach(r => {
    const icon = r.ok ? '✅' : (r.status.startsWith('skip') ? '⏭' : '❌');
    const t = r.elapsed ? `${r.elapsed}ms` : 'N/A';
    console.log(`${icon} ${r.name}`);
    console.log(`   Status: ${r.status} | ${t}`);
    if (r.err) console.log(`   Err: ${r.err}`);
    console.log('');
  });

  const reportPath = path.resolve(REPO, 'cli-coverage-results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), total, passed, failed, skipped, durationMs: Date.now() - T0, tests: RES }, null, 2));
  console.log(`\nFichier: ${reportPath}`);

  const effective = total - skipped;
  if (failed === 0 && passed === effective) {
    console.log('\n🏆 COUVERTURE COMPLÈTE');
  } else if (passed >= effective * 0.7) {
    console.log(`\n⚠️  COUVERTURE BONNE (${Math.round(passed/effective*100)}%)`);
  } else {
    console.log(`\n💀 DÉGRADÉ (${failed} échecs)`);
  }
}

main().catch(e => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
