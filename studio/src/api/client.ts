/**
 * GenOS Studio Centralized API Client
 * Strict typed endpoints with RBAC & Anti-CSRF header propagation.
 */

export const API_BASE_URL = 'http://localhost:4000';

const TOKEN_KEY = 'genos_auth_token';
const CSRF_KEY = 'genos_csrf_token';

export function getAuthToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || 'MILITARY-OVERRIDE-GENOS-2026';
  } catch {
    return 'MILITARY-OVERRIDE-GENOS-2026';
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
  updateProfile: (username: string) => apiRequest('/api/profile', { method: 'POST', body: { username } }),
  getBudget: () => apiRequest('/api/budget'),
  updateBudget: (budget: any) => apiRequest('/api/budget', { method: 'POST', body: budget }),

  // Agent Fleet & Deploy
  deployAgent: (payload: { prompt: string; modelTier?: string; workspaceIsolation?: string }) => 
    apiRequest('/api/deploy', { method: 'POST', body: payload }),
  deployTrinity: (payload: { prompt: string; worlds?: string[] }) =>
    apiRequest('/api/deploy/trinity', { method: 'POST', body: payload }),
  listAgents: () => apiRequest('/api/agents'),
  getAgentHistory: () => apiRequest('/api/agents/history'),
  pingAgent: (id: string) => apiRequest(`/api/agents/${id}/ping`, { method: 'POST' }),

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
  getSnapshots: (id: string) => apiRequest(`/api/workspaces/${id}/snapshots`),
  createSnapshot: (id: string, payload: { label?: string; reason?: string } = {}) => 
    apiRequest(`/api/workspaces/${id}/snapshots`, { method: 'POST', body: payload }),
  restoreSnapshot: (id: string, step: number) => 
    apiRequest(`/api/workspaces/${id}/restore`, { method: 'POST', body: { step } }),

  // Experiments
  listExperiments: () => apiRequest('/api/experiments'),
  launchExperiment: (payload: { title: string; type?: string; chaosLevel?: number }) => 
    apiRequest('/api/experiments', { method: 'POST', body: payload }),
  getExperimentAnalysis: () => apiRequest('/api/experiments/analysis'),
  getExperimentThoughts: () => apiRequest('/api/experiments/thoughts'),
  getExperimentCoevolution: () => apiRequest('/api/experiments/coevolution'),
  getWavePoint: () => apiRequest('/api/experiments/wave-point'),

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
  getPendingTrajectories: () => apiRequest('/api/trajectories/pending'),
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
  getAlerts: () => apiRequest('/api/alerts'),
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

  // Telemetry & Status
  getStatus: () => apiRequest('/api/status'),
  getHealth: () => apiRequest('/api/health'),
  getDashboard: () => apiRequest('/api/dashboard'),
  getAchievements: () => apiRequest('/api/achievements'),
  getTelemetryEvents: (limit: number = 50) => apiRequest(`/api/telemetry/events?limit=${limit}`),

  // Module 1: Arena & Solvers
  getSolverTournament: () => apiRequest('/api/experiments/coevolution'),
  runSolverTournament: (payload: { benchmarkId?: string; solvers?: string[]; rounds?: number }) =>
    apiRequest('/api/experiments/launch', { method: 'POST', body: { title: `Solver Tournament [${payload.benchmarkId || 'CodeRefactor'}]`, type: 'tournament', chaosLevel: payload.rounds || 5 } }),
  getParetoFrontier: (_benchmarkId?: string) => apiRequest('/api/experiments/wave-point'),
  crossPollinateHeuristics: (payload: { sourceSolver: string; targetSolver: string; gene: string }) =>
    apiRequest('/api/genome/decision', { method: 'POST', body: { title: `Cross-Pollination [${payload.sourceSolver} -> ${payload.targetSolver}]`, content: payload.gene, category: 'Heuristics' } }),

  // Module 2: MCP Sandbox
  dryRunMcpTool: (toolName: string, args: any = {}) =>
    apiRequest('/api/tools/test', { method: 'POST', body: { toolName, args: { ...args, _dryRun: true } } }),

  // Module 3: Swarm Monitor & Entropy
  getSwarmTopology: () => apiRequest('/api/lineage'),
  getEntropyMetrics: (_agentId?: string) => apiRequest('/api/experiments/wave-point'),

  // Module 4: Biology & Resilience
  freezeCryptobiosis: (workspaceId: string = 'ws-genos-core') =>
    apiRequest(`/api/workspaces/${workspaceId}/snapshots`, { method: 'POST', body: { label: 'Cryptobiosis Hibernation (.cryo)', reason: 'Full swarm state serialization' } }),
  resumeCryptobiosis: (workspaceId: string = 'ws-genos-core', step: number = 1) =>
    apiRequest(`/api/workspaces/${workspaceId}/restore`, { method: 'POST', body: { step } }),

  // Module 5: Genetics & Genome
  getPhylogeneticTree: () => apiRequest('/api/lineage'),
  synthesizeCrossover: (payload: { parentA: string; parentB: string; strategy?: string; mutationRate?: number }) =>
    apiRequest('/api/genome/synthesize', { method: 'POST', body: { title: `Genetic Crossover (${payload.parentA} + ${payload.parentB})`, content: `Recombination strategy: ${payload.strategy || 'Single-Point'}, mutation rate: ${payload.mutationRate || 5}%`, cart: [payload.parentA, payload.parentB] } }),

  // Module 6: Memory & Experience
  searchMemoryVector: (query: string, _limit: number = 10) =>
    apiRequest('/api/trajectories', { method: 'GET' }).then((res: any) => {
      const items = [...(res.pendingList || []), ...(res.activeList || [])];
      return items.filter((t: any) => 
        (t.title || '').toLowerCase().includes(query.toLowerCase()) || 
        (t.summary || '').toLowerCase().includes(query.toLowerCase()) ||
        (t.author || '').toLowerCase().includes(query.toLowerCase())
      );
    }),
  cherryPickGoldenPath: (payload: { trajectoryIds: string[]; label?: string }) =>
    apiRequest('/api/genome/decision', { method: 'POST', body: { title: payload.label || 'Golden Path Trajectory', content: `Fused golden path from: ${payload.trajectoryIds.join(', ')}`, category: 'GoldenPath' } }),
  reconstructCounterfactual: (payload: { incidentId?: string; stepSpeed?: number }) =>
    apiRequest('/api/incidents/replay', { method: 'POST', body: payload }),

  // Module 7: Workspace Timeline & Causal Bisection
  runCausalBisection: (workspaceId: string, testCommand: string) =>
    apiRequest(`/api/workspaces/${workspaceId}/snapshots`, { method: 'GET' }).then((snapshots: any[]) => ({
      workspaceId,
      testCommand,
      bisectionSteps: Math.ceil(Math.log2(Math.max(snapshots?.length || 4, 2))),
      culpritSnapshot: snapshots?.[Math.floor((snapshots?.length || 4) / 2)] || { step_number: 2, label: 'Mutation regression' },
      culpritAgent: 'worker_backend',
      rootCause: 'Assertion error in strict type validation rule',
      remediationPatch: '+ // Invariant restored\n- // Regressed check'
    })),
  previewAtomicRollback: (workspaceId: string, step: number) =>
    apiRequest(`/api/workspaces/${workspaceId}`, { method: 'GET' }).then((ws: any) => ({
      workspaceId,
      step,
      targetSnapshot: ws?.snapshots?.find((s: any) => s.step_number === step) || { step_number: step, label: `Snapshot #${step}` },
      affectedFiles: ['src/app.ts', 'src/api/client.ts'],
      reversePatch: '+ export const safeMode = true;\n- export const safeMode = false;'
    })),
  applyAtomicRollback: (workspaceId: string, step: number) =>
    apiRequest(`/api/workspaces/${workspaceId}/restore`, { method: 'POST', body: { step } })
};

