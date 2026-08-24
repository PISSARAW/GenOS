/**
 * GenOS Studio Centralized API Client
 * Strict typed endpoints with RBAC & Anti-CSRF header propagation.
 */

export * from './http';
import { extendedApi } from './endpoints';

// API Service Modules (All functions <= 3 params)
const coreApi = {
  // Auth
  verifyToken: (token: string) => apiRequest('/api/auth/verify-token', { method: 'POST', body: { token } }),
  getSession: () => apiRequest('/api/auth/session'),

  // Config & Profile
  getConfig: () => apiRequest('/api/config'),
  getWorkspaceDiff: (base: string, target: string) => apiRequest(`/api/workspaces/diff?base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}`),
  updateProfile: (username: string) => apiRequest('/api/profile', { method: 'POST', body: { username } }),
  getBudget: () => apiRequest('/api/budget'),
  updateBudget: (budget: any) => apiRequest('/api/budget', { method: 'POST', body: budget }),
  getSafeDebuggingProof: () => apiRequest('/api/product-proofs/safe-debugging'),
  runSafeDebuggingProof: () => apiRequest('/api/product-proofs/safe-debugging/run', { method: 'POST', body: {} }),
  inspectSafeDebuggingWorkspace: (workspaceId: string) => apiRequest(`/api/product-proofs/safe-debugging/workspaces/${encodeURIComponent(workspaceId)}`),
  runSafeDebuggingWorkspaceTest: (workspaceId: string, commandId: string) => apiRequest(`/api/product-proofs/safe-debugging/workspaces/${encodeURIComponent(workspaceId)}/run`, { method: 'POST', body: { commandId } }),

  // Agent Fleet & Deploy
  deployAgent: (payload: { prompt: string; name?: string; role?: string; executionMode?: 'orchestrator' | 'worker'; agentType?: string; modelTier?: string; workspaceIsolation?: string; workspaceId?: string; fleetId?: string; language?: string; about?: string; parentAgentId?: string; lineageRelation?: string; executionBudget?: { tokens?: number; costUsd?: number; latencyMs?: number; events?: number } }) =>
    apiRequest('/api/deploy', { method: 'POST', body: payload }),
  deployTrinity: (payload: { prompt: string; agentType?: string; worlds?: string[]; workspaceId?: string }) =>
    apiRequest('/api/deploy/trinity', { method: 'POST', body: payload }),
  listTrinityWorlds: () => apiRequest('/api/deploy/trinity'),
  listAgents: () => apiRequest('/api/agents'),
  stopAgent: (id: string) => apiRequest(`/api/agents/${encodeURIComponent(id)}/stop`, { method: 'POST' }),
  stopAgents: (agentIds: string[]) => apiRequest('/api/agents/bulk-stop', { method: 'POST', body: { agentIds } }),
  deleteAgents: (agentIds: string[]) => apiRequest('/api/agents/bulk-delete', { method: 'POST', body: { agentIds } }),
  deleteAgent: (id: string) => apiRequest(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getAgentHistory: () => apiRequest('/api/agents/history'),
  pingAgent: (id: string) => apiRequest(`/api/agents/${id}/ping`, { method: 'POST' }),
  ingestAgentEvent: (id: string, payload: any) => apiRequest(`/api/agents/${id}/events`, { method: 'POST', body: payload }),
  startAgent: (id: string, executionBudget?: { tokens?: number; costUsd?: number; latencyMs?: number; events?: number }) => apiRequest(`/api/agents/${id}/start`, { method: 'POST', body: executionBudget ? { executionBudget } : undefined }),
  getWorkerGarage: (orchestratorId: string) => apiRequest(`/api/agents/${encodeURIComponent(orchestratorId)}/workers/garage`),
  createWorker: (orchestratorId: string, payload: { mission: string; workspaceId: string; role?: string; name?: string; modelTier?: string }) =>
    apiRequest('/api/deploy', { method: 'POST', body: { prompt: payload.mission, workspaceId: payload.workspaceId, role: payload.role, name: payload.name, modelTier: payload.modelTier, executionMode: 'worker', parentAgentId: orchestratorId } }),
  dispatchWorker: (orchestratorId: string, workerId: string, payload?: { mission?: string; prompt?: string; role?: string; name?: string; executionBudget?: { tokens?: number; costUsd?: number; latencyMs?: number; events?: number } }) =>
    apiRequest(`/api/agents/${encodeURIComponent(orchestratorId)}/workers/${encodeURIComponent(workerId)}/dispatch`, { method: 'POST', body: payload }),
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
  getModelStatus: (model?: string) => apiRequest(`/api/model${model ? `?model=${encodeURIComponent(model)}` : ''}`),
  testModel: (prompt: string, model?: string) => apiRequest('/api/model/test', { method: 'POST', body: { prompt, model } }),

  // Visual workflows
  listWorkflows: (workspaceId?: string) => apiRequest(`/api/workflows${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''}`),
  createWorkflow: (payload: { name: string; workspaceId?: string | null; description?: string; graph?: any; metadata?: any }) => apiRequest('/api/workflows', { method: 'POST', body: payload }),
  getWorkflow: (id: string) => apiRequest(`/api/workflows/${encodeURIComponent(id)}`),
  updateWorkflow: (id: string, payload: { name?: string; description?: string; status?: string; graph: any; metadata?: any }) => apiRequest(`/api/workflows/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),
  validateWorkflow: (id: string, graph?: any) => apiRequest(`/api/workflows/${encodeURIComponent(id)}/validate`, { method: 'POST', body: graph ? { graph } : {} }),
  runWorkflow: (id: string, input: any = {}) => apiRequest(`/api/workflows/${encodeURIComponent(id)}/runs`, { method: 'POST', body: { input } }),
  listWorkflowRuns: (id: string) => apiRequest(`/api/workflows/${encodeURIComponent(id)}/runs`),

  // Prompt registry and model playground
  listPrompts: () => apiRequest('/api/prompts'),
  createPrompt: (payload: { name: string; template: string; variables?: string[]; model?: string }) => apiRequest('/api/prompts', { method: 'POST', body: payload }),
  getPrompt: (id: string) => apiRequest(`/api/prompts/${encodeURIComponent(id)}`),
  createPromptVersion: (id: string, payload: { template: string; model?: string; config?: any }) => apiRequest(`/api/prompts/${encodeURIComponent(id)}/versions`, { method: 'POST', body: payload }),
  renderPrompt: (id: string, version: number, variables: any) => apiRequest(`/api/prompts/${encodeURIComponent(id)}/render`, { method: 'POST', body: { version, variables } }),
  runPlayground: (payload: { prompt: string; models: string[]; variables?: any }) => apiRequest('/api/prompts/playground', { method: 'POST', body: payload }),
  listModelJobs: () => apiRequest('/api/prompts/jobs'),
  streamModelJob: (id: string) => `${API_BASE_URL}/api/prompts/jobs/${encodeURIComponent(id)}/stream`,

};

export const api = {
  ...coreApi,
  ...extendedApi,
};

export async function ensureTenantScope(): Promise<TenantScope> {
  const existing = getTenantScope();
  if (existing) return existing;

  const organizations = await api.listOrganizations();
  const organization = Array.isArray(organizations) && organizations[0]
    ? organizations[0]
    : await api.createOrganization('GenOS Studio');
  const baseName = 'Default Project';
  let project: any;
  try {
    project = await api.createProject(organization.id, baseName);
  } catch {
    project = await api.createProject(organization.id, `${baseName} ${Date.now()}`);
  }
  const scope = { organizationId: organization.id, projectId: project.id };
  setTenantScope(scope);
  return scope;
}
