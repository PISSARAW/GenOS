/**
 * GenOS Studio Centralized API Client
 * Strict typed endpoints with RBAC & Anti-CSRF header propagation.
 */

export const API_BASE_URL = 'http://localhost:4000';

const TOKEN_KEY = 'genos_auth_token';
const CSRF_KEY = 'genos_csrf_token';

export function getAuthToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function getCsrfToken(): string {
  try {
    let token = localStorage.getItem(CSRF_KEY);
    if (!token) {
      token = 'csrf-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem(CSRF_KEY, token);
    }
    return token;
  } catch {
    return 'csrf-fallback-local';
  }
}

export interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

export async function apiRequest<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const method = options.method || 'GET';
  const token = getAuthToken();
  const csrf = getCsrfToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrf,
    'X-Access-Key': token,
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };

  const config: RequestInit = {
    method,
    headers,
    credentials: 'omit'
  };

  if (options.body && method !== 'GET') {
    config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const response = await fetch(url, config);
  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) {
        errorDetail = errJson.error.message;
      }
    } catch {}
    throw new Error(errorDetail);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text() as unknown as T;
}

// API Service Modules (All functions <= 3 params)
export const api = {
  // Auth
  verifyToken: (token: string) => apiRequest('/api/auth/verify-token', { method: 'POST', body: { token } }),
  getSession: () => apiRequest('/api/auth/session'),

  // Config & Profile
  getConfig: () => apiRequest('/api/config'),
  getWorkspaceDiff: (base: string, target: string) => apiRequest(`/api/workspaces/diff?base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}`),
  updateProfile: (username: string) => apiRequest('/api/profile', { method: 'POST', body: { username } }),
  getBudget: () => apiRequest('/api/budget'),
  updateBudget: (budget: any) => apiRequest('/api/budget', { method: 'POST', body: budget }),

  // Agent Fleet & Deploy
  deployAgent: (payload: { prompt: string; agentType?: string; modelTier?: string; workspaceIsolation?: string; workspaceId?: string; fleetId?: string; language?: string; about?: string; parentAgentId?: string; lineageRelation?: string; executionBudget?: { tokens?: number; costUsd?: number; latencyMs?: number; events?: number } }) =>
    apiRequest('/api/deploy', { method: 'POST', body: payload }),
  deployTrinity: (payload: { prompt: string; agentType?: string; worlds?: string[] }) =>
    apiRequest('/api/deploy/trinity', { method: 'POST', body: payload }),
  listTrinityWorlds: () => apiRequest('/api/deploy/trinity'),
  listAgents: () => apiRequest('/api/agents'),
  getAgentHistory: () => apiRequest('/api/agents/history'),
  pingAgent: (id: string) => apiRequest(`/api/agents/${id}/ping`, { method: 'POST' }),
  ingestAgentEvent: (id: string, payload: any) => apiRequest(`/api/agents/${id}/events`, { method: 'POST', body: payload }),
  startAgent: (id: string, executionBudget?: { tokens?: number; costUsd?: number; latencyMs?: number; events?: number }) => apiRequest(`/api/agents/${id}/start`, { method: 'POST', body: executionBudget ? { executionBudget } : undefined }),
  subscribeAgent: (id: string) => apiRequest(`/api/agents/${id}/subscribe`, { method: 'POST' }),
  getAgentStrategyContract: (id: string) => apiRequest(`/api/agents/${encodeURIComponent(id)}/strategy-contract`),
  getAgentStrategyContractHistory: (id: string) => apiRequest(`/api/agents/${encodeURIComponent(id)}/strategy-contracts`),
  selectAgentStrategyContract: (id: string, payload: { problem?: string; contract?: any; decisionReason?: string }) =>
    apiRequest(`/api/agents/${encodeURIComponent(id)}/strategy-contracts`, { method: 'POST', body: payload }),
  getLatestAgentExecutionRun: (id: string) => apiRequest(`/api/agents/${encodeURIComponent(id)}/execution-runs/latest`),
  getAgentExecutionRuns: (id: string) => apiRequest(`/api/agents/${encodeURIComponent(id)}/execution-runs`),
  approveExecutionRun: (runId: string) => apiRequest(`/api/execution-runs/${encodeURIComponent(runId)}/approve`, { method: 'POST' }),
  listStrategyRegistry: (family?: string, maturity?: string) =>
    apiRequest(`/api/strategies?${family ? `family=${encodeURIComponent(family)}&` : ''}${maturity ? `maturity=${encodeURIComponent(maturity)}` : ''}`),
  previewStrategySelection: (payload: any) => apiRequest('/api/strategies/select', { method: 'POST', body: payload }),

  // Commands & Terminal
  sendCommand: (action: string, payload?: any) => 
    apiRequest('/api/command', { method: 'POST', body: { action, payload } }),
  sendTerminalCommand: (command: string) => 
    apiRequest('/api/terminal', { method: 'POST', body: { command } }),

  // Workspaces & Snapshots
  listWorkspaces: () => apiRequest('/api/workspaces'),
  createWorkspace: (name: string, description?: string) => 
    apiRequest('/api/workspaces', { method: 'POST', body: { name, description } }),
  getWorkspace: (id: string) => apiRequest(`/api/workspaces/${id}`),
  getWorkspaceFiles: (id: string) => apiRequest(`/api/workspaces/${encodeURIComponent(id)}/files`),
  getSnapshots: (id: string) => apiRequest(`/api/workspaces/${id}/snapshots`),
  createSnapshot: (id: string, payload: { label?: string; reason?: string } = {}) => 
    apiRequest(`/api/workspaces/${id}/snapshots`, { method: 'POST', body: payload }),
  restoreSnapshot: (id: string, step: number) => 
    apiRequest(`/api/workspaces/${id}/restore`, { method: 'POST', body: { step } }),

  // Visual workflows
  listWorkflows: (workspaceId?: string) => apiRequest(`/api/workflows${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`),
  createWorkflow: (payload: { name: string; workspaceId?: string | null; description?: string; graph?: any; metadata?: any }) => apiRequest('/api/workflows', { method: 'POST', body: payload }),
  getWorkflow: (id: string) => apiRequest(`/api/workflows/${encodeURIComponent(id)}`),
  updateWorkflow: (id: string, payload: { name?: string; description?: string; status?: string; graph: any; metadata?: any }) => apiRequest(`/api/workflows/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),
  validateWorkflow: (id: string, graph?: any) => apiRequest(`/api/workflows/${encodeURIComponent(id)}/validate`, { method: 'POST', body: graph ? { graph } : {} }),
  runWorkflow: (id: string, input: any = {}) => apiRequest(`/api/workflows/${encodeURIComponent(id)}/runs`, { method: 'POST', body: { input } }),
  listWorkflowRuns: (id: string) => apiRequest(`/api/workflows/${encodeURIComponent(id)}/runs`),

  // Experiments
  listExperiments: (workspaceId?: string) => apiRequest(`/api/experiments${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`),
  launchExperiment: (payload: { title: string; type?: string; chaosLevel?: number }) => 
    apiRequest('/api/experiments', { method: 'POST', body: payload }),
  getExperimentAnalysis: (experimentId?: string) => apiRequest(`/api/experiments/analysis${experimentId ? `?experimentId=${encodeURIComponent(experimentId)}` : ''}`),
  getExperimentThoughts: (experimentId: string) => apiRequest(`/api/experiments/thoughts?experimentId=${encodeURIComponent(experimentId)}`),
  getExperimentCoevolution: (experimentId: string) => apiRequest(`/api/experiments/coevolution?experimentId=${encodeURIComponent(experimentId)}`),
  getExperimentWaves: (experimentId: string) => apiRequest(`/api/experiments/${encodeURIComponent(experimentId)}/waves`),

  // Lineage & DAG
  getLineage: () => apiRequest('/api/lineage'),
  inspectNode: (id: string) => apiRequest('/api/nodes/inspect', { method: 'POST', body: { id } }),
  cloneNode: (id: string) => apiRequest('/api/nodes/clone', { method: 'POST', body: { id } }),
  killNode: (id: string) => apiRequest('/api/nodes/kill', { method: 'POST', body: { id } }),
  getGenomeGraph: () => apiRequest('/api/genome/graph'),
  synthesizeGenome: (payload: { title?: string; content?: string; cart?: string[]; cartNodes?: string[] }) => 
    apiRequest('/api/genome/synthesize', { method: 'POST', body: payload }),
  recordDecision: (payload: { title: string; content: string; category?: string }) => 
    apiRequest('/api/genome/decision', { method: 'POST', body: payload }),

  // Trajectories
  getTrajectories: () => apiRequest('/api/trajectories'),
  getPendingTrajectories: (workspaceId?: string) => apiRequest(`/api/trajectories/pending${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`),
  getActiveTrajectories: () => apiRequest('/api/trajectories/active'),
  approveTrajectory: (id: string) => apiRequest(`/api/trajectories/${id}/approve`, { method: 'POST' }),
  rejectTrajectory: (id: string, reason?: string) => apiRequest(`/api/trajectories/${id}/reject`, { method: 'POST', body: { reason } }),
  reviseTrajectory: (id: string, notes?: string) => apiRequest(`/api/trajectories/${id}/revise`, { method: 'POST', body: { notes } }),

  // Swarm & Quorum
  getConsensus: () => apiRequest('/api/swarm/consensus'),
  createProposal: (payload: { title: string; description: string; quorumThreshold?: number }) => 
    apiRequest('/api/swarm/proposals', { method: 'POST', body: payload }),
  castVote: (payload: { proposalId: string; vote: 'yes' | 'no'; agentId?: string; reason?: string }) => 
    apiRequest('/api/swarm/vote', { method: 'POST', body: payload }),

  // MCP Arsenal & Circuit Breaker
  listTools: () => apiRequest('/api/tools'),
  testTool: (toolName: string, args: any = {}) => 
    apiRequest('/api/tools/test', { method: 'POST', body: { toolName, args } }),
  executeTool: (toolName: string, args: any = {}) =>
    apiRequest('/api/mcp/execute', { method: 'POST', body: { toolName, args } }),
  toggleCircuitBreaker: (toolName: string, locked: boolean) => 
    apiRequest('/api/mcp/circuit-breaker', { method: 'POST', body: { toolName, locked } }),
  equipTool: (toolName: string, agents: string[]) => 
    apiRequest('/api/mcp/equip', { method: 'POST', body: { toolName, targetAgents: agents } }),

  // Incidents & Alerts
  getAlerts: (workspaceId?: string) => apiRequest(`/api/alerts${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`),
  getIncidents: () => apiRequest('/api/incidents'),
  replayIncident: (payload: { incidentId?: string; stepSpeed?: number }) =>
    apiRequest('/api/incidents/replay', { method: 'POST', body: payload }),
  killTask: (id: string) => apiRequest(`/api/tasks/${id}/kill`, { method: 'POST' }),

  // Security & Kill Switch
  triggerKillSwitch: (reason?: string) => 
    apiRequest('/api/security/kill-switch', { method: 'POST', body: { reason } }),
  resetKillSwitch: () => apiRequest('/api/security/kill-switch/reset', { method: 'POST' }),
  haltAll: () => apiRequest('/api/halt', { method: 'POST' }),
  getSecurityStatus: () => apiRequest('/api/security/status'),
  // Compliance, IDE contracts & versioned schema control plane
  listComplianceFrameworks: () => apiRequest('/api/compliance/frameworks'),
  listComplianceReports: (framework?: string) => apiRequest(`/api/compliance/reports${framework ? `?framework=${encodeURIComponent(framework)}` : ''}`),
  generateComplianceReport: (framework: string, workspaceId?: string) => apiRequest('/api/compliance/reports', { method: 'POST', body: { framework, workspaceId } }),
  getComplianceExportUrl: (id: string, format = 'json') => `${API_BASE_URL}/api/compliance/reports/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`,
  getIdeContract: () => apiRequest('/api/ide/contract'),
  listIdeIntegrations: () => apiRequest('/api/ide/integrations'),
  connectIde: (payload: { ide: string; workspaceId?: string; version?: string }) => apiRequest('/api/ide/integrations', { method: 'POST', body: payload }),
  getSchemaStatus: () => apiRequest('/api/schema/status'),
  applySchemaMigrations: () => apiRequest('/api/schema/migrate', { method: 'POST', body: {} }),

  // Telemetry & Status
  getStatus: () => apiRequest('/api/status'),
  getHealth: () => apiRequest('/api/health'),
  getDashboard: () => apiRequest('/api/dashboard'),
  getAchievements: () => apiRequest('/api/achievements'),
  getTelemetryEvents: (limit: number = 50, agentId?: string) => apiRequest(`/api/telemetry/events?limit=${limit}${agentId ? `&agent_id=${encodeURIComponent(agentId)}` : ''}`),

  // Evaluation, MCTS controls, provenance and notification policy
  getEvaluationOverview: () => apiRequest('/api/evaluation/overview'),
  runImpossibleBench: (payload: { abstentionThreshold?: number; modelVersion?: string } = {}) => apiRequest('/api/evaluation/impossible-bench', { method: 'POST', body: payload }),
  pruneMctsNode: (id: string) => apiRequest(`/api/evaluation/mcts/${encodeURIComponent(id)}/prune`, { method: 'POST' }),
  updateNotificationPreferences: (preferences: any[]) => apiRequest('/api/evaluation/notifications', { method: 'POST', body: { preferences } }),

  // Module 1: Arena & Solvers
  getSolverTournament: () => apiRequest('/api/arena/tournament'),
  runSolverTournament: (payload: { benchmarkId?: string; solvers?: string[]; rounds?: number }) =>
    apiRequest('/api/arena/tournament', { method: 'POST', body: { problemSpec: payload.benchmarkId ? { title: payload.benchmarkId } : undefined, solvers: payload.solvers, rounds: payload.rounds } }),
  getParetoFrontier: (_benchmarkId?: string) => apiRequest('/api/arena/pareto'),
  getArenaTrace: (tournamentId?: string, format: string = 'json-dag') => apiRequest(`/api/arena/trace?${tournamentId ? `tournamentId=${encodeURIComponent(tournamentId)}&` : ''}format=${encodeURIComponent(format)}`),
  crossPollinateHeuristics: (payload: { sourceSolver: string; targetSolver: string; gene: string }) =>
    apiRequest('/api/genome/decision', { method: 'POST', body: { title: `Cross-Pollination [${payload.sourceSolver} -> ${payload.targetSolver}]`, content: payload.gene, category: 'Heuristics' } }),

  // Module 2: MCP Sandbox
  dryRunMcpTool: (toolName: string, args: any = {}) =>
    apiRequest('/api/tools/dry-run', { method: 'POST', body: { toolName, args } }),
  getMcpToolSchema: (toolName: string) => apiRequest(`/api/tools/${encodeURIComponent(toolName)}/schema`),

  // Module 3: Swarm Monitor & Entropy
  getSwarmTopology: () => apiRequest('/api/swarm/topology'),
  getEntropyMetrics: (_agentId?: string) => apiRequest('/api/swarm/metrics'),

  // Module 4: Biology & Resilience
  triggerApoptosis: (agentId: string, triggerMetrics: any = {}) =>
    apiRequest('/api/resilience/apoptosis', { method: 'POST', body: { agentId, triggerMetrics } }),
  getResiliencePolicy: () => apiRequest('/api/resilience/policy'),
  updateResiliencePolicy: (policy: any) => apiRequest('/api/resilience/policy', { method: 'POST', body: policy }),
  freezeCryptobiosis: (workspaceId: string = 'fleet') =>
    apiRequest('/api/resilience/cryptobiosis/freeze', { method: 'POST', body: { workspaceId, reason: 'Full swarm state serialization' } }),
  resumeCryptobiosis: (snapshotId: string, workspaceId?: string) =>
    apiRequest('/api/resilience/cryptobiosis/thaw', { method: 'POST', body: { snapshotId, targetWorkspaceId: workspaceId } }),

  // Module 5: Genetics & Genome
  getPhylogeneticTree: () => apiRequest('/api/genome/phylogeny'),
  getAlleles: () => apiRequest('/api/genome/alleles'),
  synthesizeCrossover: (payload: { parentA: any; parentB: any; strategy?: string; mutationRate?: number }) =>
    apiRequest('/api/genome/crossover', { method: 'POST', body: { parentA: payload.parentA, parentB: payload.parentB, options: { strategy: payload.strategy, mutationRate: (payload.mutationRate || 0) / 100 } } }),

  // Module 6: Memory & Experience
  searchMemoryVector: (query: string, limit: number = 10) =>
    apiRequest(`/api/memory/search?q=${encodeURIComponent(query)}&limit=${limit}`).then((res: any) => res?.allScoredExperiences || []),
  cherryPickGoldenPath: (payload: { turns: any[]; label?: string }) =>
    apiRequest('/api/memory/cherry-pick', { method: 'POST', body: payload }),
  reconstructCounterfactual: (payload: { trajectory: any; stepIndex?: number; alterations?: any }) =>
    apiRequest('/api/memory/counterfactual', { method: 'POST', body: payload }),

  // Module 7: Workspace Timeline & Causal Bisection
  runCausalBisection: (workspaceId: string, testCommand: string) =>
    apiRequest('/api/workspaces/bisect', { method: 'POST', body: { workspaceId, testCommand } }),
  previewAtomicRollback: (workspaceId: string, step: number) =>
    apiRequest(`/api/workspaces/${workspaceId}/rollback-preview?step=${step}`, { method: 'GET' }),
  applyAtomicRollback: (workspaceId: string, step: number) =>
    apiRequest(`/api/workspaces/${workspaceId}/restore`, { method: 'POST', body: { stepNumber: step } }),

  // Platform & Safety control plane
  getPlatformGraph: () => apiRequest('/api/platform/causal-graph'),
  getPlatformTelemetry: () => apiRequest('/api/platform/telemetry/summary'),
  getPlatformProviders: () => apiRequest('/api/platform/providers'),
  routePlatformModel: (payload: any) => apiRequest('/api/platform/route', { method: 'POST', body: payload }),
  getPlatformPermissions: () => apiRequest('/api/platform/permissions'),
  savePlatformPermission: (payload: any) => apiRequest('/api/platform/permissions', { method: 'POST', body: payload }),
  validatePlatformToolCall: (payload: any) => apiRequest('/api/platform/tool-calls/validate', { method: 'POST', body: payload }),
  getPlatformAudit: () => apiRequest('/api/platform/audit'),
  getPlatformApprovals: () => apiRequest('/api/platform/approvals'),
  decidePlatformApproval: (id: string, decision: string, reason?: string) => apiRequest(`/api/platform/approvals/${id}/decision`, { method: 'POST', body: { decision, reason } }),
  replayPlatformIncident: (id: string, stepSpeed = 100) => apiRequest(`/api/platform/incidents/${encodeURIComponent(id)}/replay`, { method: 'POST', body: { stepSpeed } }),
  bisectPlatformIncident: (workspaceId: string, firstBadStep?: number) => apiRequest('/api/platform/incidents/bisect', { method: 'POST', body: { workspaceId, firstBadStep } }),
  paretoPlatformEvaluation: (items: any[]) => apiRequest('/api/platform/evaluations/pareto', { method: 'POST', body: { items } })
};
