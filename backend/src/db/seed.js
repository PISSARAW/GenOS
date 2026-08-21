/**
 * GenOS Database Seeding Coordinator
 */

const crypto = require('crypto');
const { SEED_KEYS, SEED_WORKSPACES, SEED_AGENTS, SEED_TRAJECTORIES } = require('./seedData');
const { seedMcpTools } = require('./seedTools');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function seedDatabase(db) {
  const existing = await db.get('SELECT COUNT(*) as count FROM access_keys');
  if (existing && existing.count > 0) return;

  // 1. Seed Access Keys
  for (const k of SEED_KEYS) {
    await db.run(
      'INSERT INTO access_keys (id, key_hash, label, role, permissions) VALUES (?, ?, ?, ?, ?)',
      k.id, hashKey(k.raw), k.label, k.role, JSON.stringify(k.perms)
    );
  }

  // 2. Seed Workspaces
  for (const w of SEED_WORKSPACES) {
    await db.run(
      'INSERT INTO workspaces (id, name, path, visibility, language, description, tags, anomalies_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      w.id, w.name, w.path, w.visibility, w.language, w.desc, JSON.stringify(w.tags), w.id === 'ws-security-arena' ? 2 : 0
    );
  }

  // 3. Seed Snapshots
  await db.run('INSERT INTO workspace_snapshots (id, workspace_id, snapshot_hash, step_number, label, author, reason, diff_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'snp-001', 'ws-genos-core', 'a1b2c3d', 1, 'Initial Architecture Setup', 'orchestrator_4', 'Workspace bootstrap', '+28 files, 4 modules'
  );
  await db.run('INSERT INTO workspace_snapshots (id, workspace_id, snapshot_hash, step_number, label, author, reason, diff_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'snp-002', 'ws-genos-core', 'e4f5g6h', 2, 'Telemetry Observer Hooked', 'telemetry_observer', 'Deployed dedicated telemetry agent', '+telemetryObserver.js'
  );

  // 4. Seed Agents
  for (const a of SEED_AGENTS) {
    await db.run(
      'INSERT INTO agents (id, name, role, status, agent_type, model_tier, workspace_id, current_task) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      a.id, a.name, a.role, a.status, a.type, a.tier, a.ws, a.task
    );
  }

  // 5. Seed Trajectories
  for (const t of SEED_TRAJECTORIES) {
    await db.run(
      'INSERT INTO trajectories (id, workspace_id, author_name, title, status, semantic_summary, qa_feedback, diff_file, diff_stats, diff_lines, confidence, adversarial_result, future_ci_result, is_exceptional) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      t.id, t.wsId, t.authorName, t.title, t.status, t.summary, t.qaFeedback, t.diffFile, t.diffStats, JSON.stringify(t.diffLines), t.confidence, t.advResult, t.futureCi, t.isExceptional
    );
  }

  // 6. Seed Lineage Nodes & Edges
  await db.run("INSERT INTO lineage_nodes (id, workspace_id, label, node_type, score, visits, pos_x, pos_y, state_summary) VALUES ('node-root', 'ws-genos-core', 'GenOS Master DAG Root', 'core', 1.0, 42, 400, 100, 'Root commit')");
  await db.run("INSERT INTO lineage_nodes (id, workspace_id, label, node_type, score, visits, pos_x, pos_y, state_summary) VALUES ('node-arch', 'ws-genos-core', 'Architecture Node', 'checkpoint', 0.94, 28, 260, 240, 'Modular backend')");
  await db.run("INSERT INTO lineage_nodes (id, workspace_id, label, node_type, score, visits, pos_x, pos_y, state_summary) VALUES ('node-sec', 'ws-genos-core', 'Security Node', 'agent', 0.98, 31, 540, 240, 'Circuit breaker')");
  await db.run("INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type, is_animated) VALUES ('edge-1', 'ws-genos-core', 'node-root', 'node-arch', 'transition', 1)");
  await db.run("INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type, is_animated) VALUES ('edge-2', 'ws-genos-core', 'node-root', 'node-sec', 'transition', 1)");

  // 7. Seed Experiments & Arenas
  await db.run(
    "INSERT INTO experiments (id, workspace_id, title, experiment_type, status, chaos_level, color, results_summary, mind_map_nodes) VALUES ('exp-001', 'ws-genos-core', 'Incident Faux-Positif & Auto-Rollback', 'incident_experiment', 'Analyzed', 45, '#6366f1', 'Rollback 500ms verified.', ?)",
    JSON.stringify([
      { label: "Agent supprime import", borderColor: '#fecdd3', bgColor: '#fff1f2', textColor: '#be123c' },
      { label: "Crash module auth", borderColor: '#fed7aa', bgColor: '#fff7ed', textColor: '#c2410c' },
      { label: "Restauration Auto (500ms)", borderColor: '#bbf7d0', bgColor: '#f0fdf4', textColor: '#15803d' }
    ])
  );
  await db.run(
    "INSERT INTO coevolution_arenas (id, experiment_id, file_path, red_team_payloads, blue_team_patches, vuln_count, patch_count, arena_code) VALUES ('arena-001', 'exp-001', 'src/api/authGuard.ts', ?, ?, 12, 11, ?)",
    JSON.stringify([{ id: 101, desc: 'SQLi bypass attempt' }]),
    JSON.stringify([{ title: 'Strict Type Parsing', desc: 'Enforce parseInt regex' }]),
    '// GenOS Co-evolution Arena - Hardened Gateway\nexport function validateSession(req) { return true; }'
  );

  // 8. Seed Thoughts & Waves
  await db.run("INSERT INTO experiment_thoughts (experiment_id, text, is_highlight) VALUES ('exp-001', 'Anomalie detectee sur API Gateway.', 0)");
  await db.run("INSERT INTO experiment_thoughts (experiment_id, text, is_highlight) VALUES ('exp-001', 'Hypothese 1 : Surcharge reseau. Ping interne OK.', 1)");
  for (let i = 1; i <= 20; i++) {
    await db.run("INSERT INTO experiment_waves (experiment_id, time_step, success_rate, stress_level) VALUES ('exp-001', ?, ?, ?)", i, 60 + Math.sin(i / 2) * 20, 30 + Math.cos(i / 3) * 15);
  }

  // 9. Seed Swarm Proposals & Votes
  await db.run("INSERT INTO swarm_proposals (id, workspace_id, proposer_agent_id, proposer_name, title, description, status, quorum_threshold) VALUES ('prop-001', 'ws-genos-core', 'agent-orchestrator', 'orchestrator_4', 'Promote Modular Express + SQLite Backend', 'Proposal for architecture migration', 'passed', 0.66)");
  await db.run("INSERT INTO swarm_votes (id, proposal_id, agent_id, agent_name, vote, reason) VALUES ('v1', 'prop-001', 'agent-orchestrator', 'orchestrator_4', 'yes', 'Architecture verified')");

  // 10. Seed MCP 40 Tools
  await seedMcpTools(db);

  // 11. Seed Telemetry & Genome Decisions
  await db.run("INSERT INTO telemetry_events (session_id, agent_id, event_type, action, detail, severity) VALUES ('sess-001', 'system', 'SYSTEM_BOOT', 'BOOT', 'GenOS Master Swarm Runtime active', 'info')");
  await db.run("INSERT INTO genome_decisions (id, title, content, created_by, category) VALUES ('dec-001', 'Adopt Flat GitHub Theme', 'Flat borders and dark palette.', 'orchestrator_4', 'UI')");
  await db.run("INSERT INTO global_alerts (id, title, status, agent_name, workspace_name, severity, confidence, context_snapshot) VALUES ('alt-001', 'Unmocking Frontend', 'running', 'worker_frontend', 'GenOS-Core', 'medium', '98%', 'Wiring live endpoints')");

  // 12. Seed Stats & Heatmap
  await db.run('INSERT INTO system_stats (id, total_actions, total_snapshots, total_tasks, total_swarms) VALUES (1, 8420, 1310, 52, 4)');
  const stmt = await db.prepare('INSERT INTO heatmap_activity (day, actions) VALUES (?, ?)');
  for (let i = 0; i < 364; i++) {
    await stmt.run(i, i % 4 === 0 ? 2 : 0);
  }
  await stmt.finalize();
}

module.exports = { seedDatabase, hashKey };
