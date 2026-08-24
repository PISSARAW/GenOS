export type StudioView = 
  | 'home' | 'safe_debugging' | 'arena' | 'mcp_sandbox' | 'swarm_monitor' | 'resilience'
  | 'genome_factory' | 'memory_engine' | 'timeline_bisection'
  | 'rag_playground'
  | 'evaluation_lineage'
  | 'studio_builder' | 'timeline' | 'experiments' | 'active_experiments'
  | 'fleets' | 'agents' | 'agent_deployment' | 'trinity' | 'agent_profile' | 'alerts' | 'workspaces'
  | 'live_matrix' | 'terminal' | 'compliance' | 'platform_safety' | 'rust_core';

export const STUDIO_VIEWS: Record<StudioView, string> = {
  home: 'Home Dashboard',
  safe_debugging: 'Safe Parallel Debugging',
  arena: 'Arena & Solvers',
  mcp_sandbox: 'MCP Sandbox & Tools',
  swarm_monitor: 'Swarm Monitor & Quorum',
  resilience: 'Biology & Resilience',
  genome_factory: 'Genetics & Genome',
  memory_engine: 'Memory & Experience',
  timeline_bisection: 'Workspace Timeline & Diff',
  rag_playground: 'RAG Playground',
  evaluation_lineage: 'Evaluation & Lineage',
  studio_builder: 'Studio Builder',
  timeline: 'Pending Trajectories',
  experiments: 'Experiments Lab',
  active_experiments: 'Active Experiments',
  fleets: 'Fleets',
  agents: 'Agents',
  agent_deployment: 'Agent Deployment',
  trinity: 'Agent Trinity',
  agent_profile: 'Agent Profile',
  alerts: 'Global Alerts & Overrides',
  workspaces: 'Workspaces List',
  live_matrix: 'Live Neural Matrix',
  terminal: 'God Mode Terminal',
  compliance: 'Compliance & IDEs',
  platform_safety: 'Platform & Safety Center',
  rust_core: 'Rust Core Console'
};
