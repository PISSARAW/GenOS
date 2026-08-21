/**
 * Static Datasets for Initial Database Seeding
 */

const SEED_KEYS = [
  { id: 'key-override', raw: 'MILITARY-OVERRIDE-GENOS-2026', label: 'Military Root Override Level 5', role: 'admin', perms: ['all', 'override_breaker', 'emergency_kill', 'mcp_destructive'] },
  { id: 'key-admin', raw: 'genos_sk_admin_2026', label: 'Swarm Security Administrator', role: 'admin', perms: ['all'] },
  { id: 'key-operator', raw: 'genos_sk_operator_2026', label: 'Swarm Operations Commander', role: 'operator', perms: ['workspace:write', 'experiment:write', 'swarm:vote', 'mcp:execute_safe'] },
  { id: 'key-viewer', raw: 'genos_sk_viewer_2026', label: 'Telemetry Observer Read-Only', role: 'viewer', perms: ['read'] }
];

const SEED_WORKSPACES = [
  { id: 'ws-genos-core', name: 'GenOS-Core', path: 'C:/Users/Shadow/Documents/GitHub/GenOS', visibility: 'Public', language: 'TypeScript', desc: 'GenOS Autonomous Multi-Agent Swarm Operating System', tags: ['typescript', 'react', 'express', 'sqlite', 'swarm'] },
  { id: 'ws-exocompute', name: 'Project-Exocompute', path: 'C:/Users/Shadow/Documents/GitHub/Exocompute', visibility: 'Private', language: 'Python', desc: 'Distributed Neural Graph Execution & Causal Modeling', tags: ['python', 'ml', 'distributed'] },
  { id: 'ws-swarm-ops', name: 'Swarm-Orchestration', path: 'C:/Users/Shadow/Documents/GitHub/Swarm-Ops', visibility: 'Private', language: 'TypeScript', desc: 'Antigravity Swarm Task Scheduler & Biomimetic Flocking', tags: ['typescript', 'biomimicry'] },
  { id: 'ws-security-arena', name: 'Security-RedTeam-Arena', path: 'C:/Users/Shadow/Documents/GitHub/SecurityArena', visibility: 'Private', language: 'TypeScript', desc: 'Adversarial Red/Blue Security Co-evolution Engine', tags: ['security', 'coevolution'] }
];

const SEED_AGENTS = [
  { id: 'agent-orchestrator', name: 'orchestrator_4', role: 'Project Orchestrator', status: 'running', type: 'Antigravity', tier: 'Ultra', ws: 'ws-genos-core', task: 'Supervising GenOS Studio unmocking and verification' },
  { id: 'agent-telemetry', name: 'telemetry_observer', role: 'Dedicated Telemetry Observer', status: 'running', type: 'Antigravity', tier: 'Flash', ws: 'ws-genos-core', task: 'Real-time telemetry event bus and metrics aggregation' },
  { id: 'agent-backend', name: 'worker_backend', role: 'Backend Implementation Agent', status: 'running', type: 'Antigravity', tier: 'Pro', ws: 'ws-genos-core', task: 'Implementing modular API, SQLite schema, and security' },
  { id: 'agent-frontend', name: 'worker_frontend', role: 'Frontend UI Engineer', status: 'running', type: 'Antigravity', tier: 'Pro', ws: 'ws-genos-core', task: 'Wiring React UI to backend endpoints with GitHub aesthetics' },
  { id: 'agent-qa', name: 'sentinel_qa', role: 'Forensic Quality & Security Auditor', status: 'idle', type: 'Antigravity', tier: 'Pro', ws: 'ws-genos-core', task: 'Automated test execution, static analysis, and verification' },
  { id: 'agent-solver-old', name: 'solver_alpha_legacy', role: 'Mathematical Optimizer', status: 'Apoptosis', type: 'Antigravity', tier: 'Flash', ws: 'ws-exocompute', task: 'Subtask completed: linear program relaxation' }
];

const SEED_TRAJECTORIES = [
  {
    id: 'traj-001',
    wsId: 'ws-genos-core',
    authorName: 'worker_backend',
    title: 'Modular Express REST Architecture & 18-Table SQLite Migration',
    status: 'pending',
    summary: 'Refactor server.js into clean modular controllers, apply strict RBAC, and eliminate mock data.',
    qaFeedback: 'Static analysis passed. 0 CVEs detected. Code style conforms to Rules 1-3.',
    diffFile: 'backend/src/db/schema.js',
    diffStats: '+420 lines, -546 lines',
    diffLines: [
      { type: 'delete', text: '- // Monolithic server.js with mock data' },
      { type: 'add', text: '+ const { getDatabase } = require("./db");' },
      { type: 'add', text: '+ const { requirePermission } = require("./middleware/auth");' },
      { type: 'add', text: '+ app.use("/api/workspaces", workspaceRoutes);' }
    ],
    confidence: 96,
    advResult: 'Passed (0 CVEs)',
    futureCi: 'Clean (100% test coverage)',
    isExceptional: 1
  },
  {
    id: 'traj-002',
    wsId: 'ws-genos-core',
    authorName: 'worker_frontend',
    title: 'GitHub Flat Dark Design System & Zero CSS Gradient Enforcement',
    status: 'active',
    summary: 'Replace glowing gradients with utilitarian borders (#30363d) and GitHub palette.',
    qaFeedback: 'Rule 5 linter executed: 0 emojis, 0 gradients found.',
    diffFile: 'studio/src/styles/github-theme.css',
    diffStats: '+180 lines, -95 lines',
    diffLines: [
      { type: 'delete', text: '- background: linear-gradient(135deg, #667eea, #764ba2);' },
      { type: 'add', text: '+ background-color: #161b22;' },
      { type: 'add', text: '+ border: 1px solid #30363d;' }
    ],
    confidence: 92,
    advResult: 'Passed (0 CVEs)',
    futureCi: 'Clean',
    isExceptional: 0
  }
];

module.exports = {
  SEED_KEYS,
  SEED_WORKSPACES,
  SEED_AGENTS,
  SEED_TRAJECTORIES
};
