/**
 * GenOS Studio Extended API Endpoint Families
 */
import { apiRequest } from './http';

export const extendedApi = {
  // OpenTelemetry-compatible trace storage and replay
  listTraces: (limit = 50) => apiRequest(`/api/traces?limit=${limit}`),
  getTrace: (traceId: string) => apiRequest(`/api/traces/${encodeURIComponent(traceId)}`),
  ingestSpan: (span: any) => apiRequest('/api/traces/ingest', { method: 'POST', body: span }),
  replayTrace: (traceId: string, override?: any) => apiRequest(`/api/traces/${encodeURIComponent(traceId)}/replay`, { method: 'POST', body: { override } }),

  // Evaluation datasets and batch jobs
  listDatasets: () => apiRequest('/api/evals/datasets'),
  createDataset: (payload: any) => apiRequest('/api/evals/datasets', { method: 'POST', body: payload }),
  addDatasetCase: (id: string, payload: any) => apiRequest(`/api/evals/datasets/${encodeURIComponent(id)}/cases`, { method: 'POST', body: payload }),
  listDatasetCases: (id: string) => apiRequest(`/api/evals/datasets/${encodeURIComponent(id)}/cases`),
  launchEvaluation: (payload: any) => apiRequest('/api/evals/jobs', { method: 'POST', body: payload }),
  listEvaluationJobs: () => apiRequest('/api/evals/jobs'),

  // RAG ingestion and retrieval inspection
  listRagDocuments: () => apiRequest('/api/rag/documents'),
  ingestRagDocument: (payload: { name: string; content: string; chunkSize?: number }) => apiRequest('/api/rag/documents', { method: 'POST', body: payload }),
  listRagChunks: (id: string) => apiRequest(`/api/rag/documents/${encodeURIComponent(id)}/chunks`),
  searchRag: (query: string, limit = 8) => apiRequest('/api/rag/search', { method: 'POST', body: { query, limit } }),

  // Connectors and plugins
  listIntegrations: () => apiRequest('/api/integrations'),
  installIntegration: (payload: any) => apiRequest('/api/integrations', { method: 'POST', body: payload }),
  disableIntegration: (id: string) => apiRequest(`/api/integrations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testIntegration: (id: string) => apiRequest(`/api/integrations/${encodeURIComponent(id)}/test`, { method: 'POST', body: {} }),

  // Controlled releases and rollback
  listReleases: () => apiRequest('/api/releases'),
  createRelease: (payload: any) => apiRequest('/api/releases', { method: 'POST', body: payload }),
  promoteRelease: (id: string, environment = 'production') => apiRequest(`/api/releases/${encodeURIComponent(id)}/promote`, { method: 'POST', body: { environment } }),
  rollbackRelease: (id: string) => apiRequest(`/api/releases/${encodeURIComponent(id)}/rollback`, { method: 'POST', body: {} }),

  // Tenancy and worker health
  listOrganizations: () => apiRequest('/api/control-plane/organizations'),
  createOrganization: (name: string) => apiRequest('/api/control-plane/organizations', { method: 'POST', body: { name } }),
  createProject: (organizationId: string, name: string) => apiRequest('/api/control-plane/projects', { method: 'POST', body: { organizationId, name } }),
  listEnvironments: () => apiRequest('/api/control-plane/environments'),
  getWorkerHealth: () => apiRequest('/api/control-plane/workers'),

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
    apiRequest('/api/workspaces/rollback', { method: 'POST', body: { workspaceId, stepNumber: step } }),

  // Platform & Safety control plane
  getPlatformGraph: () => apiRequest('/api/platform/causal-graph'),
  getPlatformTelemetry: () => apiRequest('/api/platform/telemetry/summary'),
  getPlatformProviders: () => apiRequest('/api/platform/providers'),
  getLocalModels: (refresh = false) => apiRequest(`/api/model/local${refresh ? '?refresh=1' : ''}`),
  routePlatformModel: (payload: any) => apiRequest('/api/platform/route', { method: 'POST', body: payload }),
  getModelRoutingPolicies: () => apiRequest('/api/platform/model-routing/policies'),
  saveModelRoutingPolicy: (agentId: string, policy: any) => apiRequest(`/api/platform/model-routing/policies/${encodeURIComponent(agentId)}`, { method: 'PUT', body: { policy } }),
  getPlatformPermissions: () => apiRequest('/api/platform/permissions'),
  savePlatformPermission: (payload: any) => apiRequest('/api/platform/permissions', { method: 'POST', body: payload }),
  validatePlatformToolCall: (payload: any) => apiRequest('/api/platform/tool-calls/validate', { method: 'POST', body: payload }),
  getPlatformAudit: () => apiRequest('/api/platform/audit'),
  getPlatformApprovals: () => apiRequest('/api/platform/approvals'),
  decidePlatformApproval: (id: string, decision: string, reason?: string) => apiRequest(`/api/platform/approvals/${id}/decision`, { method: 'POST', body: { decision, reason } }),
  replayPlatformIncident: (id: string, stepSpeed = 100) => apiRequest(`/api/platform/incidents/${encodeURIComponent(id)}/replay`, { method: 'POST', body: { stepSpeed } }),
  paretoPlatformEvaluation: (items: any[]) => apiRequest('/api/platform/evaluations/pareto', { method: 'POST', body: { items } })
};
