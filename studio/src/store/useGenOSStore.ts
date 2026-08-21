import { create } from 'zustand';
import { api, API_BASE_URL } from '../api/client';

export interface Clone {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'running' | 'error' | 'terminated';
  agentType: 'GenOS' | 'Antigravity' | 'Codex' | 'ChatGPT' | 'Claude' | 'Other' | string;
  workspaceId?: string | null;
  about?: string;
  parentAgentId?: string | null;
  parentAgentName?: string | null;
  lineageRelation?: 'independent' | 'child' | 'mutation' | 'clone' | string;
  fleetId?: string | null;
  hallucinationMonitoring?: boolean | number;
  language?: string | null;
  lastAction?: string;
  currentTask?: string;
  trinityWorldId?: string | null;
  trinityWorldName?: string | null;
  trinityStrategy?: string | null;
  trinityMission?: string | null;
}

export interface MCTSTreeNode {
  id: string;
  parentId?: string;
  score: number;
  visits: number;
  state: string;
  children?: MCTSTreeNode[];
}

export interface HallucinationAlert {
  id: string;
  timestamp: string;
  agentId: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface TraceSpan {
  id: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  inputs?: any;
  outputs?: any;
  error?: string;
}

export interface EvaluationScore {
  id: string;
  timestamp: string;
  agentId: string;
  metricName: string;
  score: number;
  details?: string;
}

interface GenOSState {
  mctsTrees: Record<string, MCTSTreeNode>;
  clones: Clone[];
  hallucinations: HallucinationAlert[];
  traces: Record<string, TraceSpan[]>;
  evaluations: EvaluationScore[];
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  selectedAgentId: string | null;

  // Actions (all <= 3 parameters)
  setSelectedAgentId: (id: string | null) => void;
  setConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected') => void;
  updateMCTSTree: (agentId: string, tree: MCTSTreeNode) => void;
  addOrUpdateClone: (clone: Clone) => void;
  addHallucination: (alert: HallucinationAlert) => void;
  addTraceSpan: (agentId: string, span: TraceSpan) => void;
  addEvaluation: (evaluation: EvaluationScore) => void;

  // Backend Actions
  fetchAgents: () => Promise<void>;
  fetchLineage: () => Promise<void>;
  cloneAgent: (agentId: string) => Promise<void>;
  inspectAgentDNA: (agentId: string) => Promise<void>;
  initializeLiveSync: () => () => void;
}

export const useGenOSStore = create<GenOSState>((set, get) => {
  return {
    mctsTrees: {},
    clones: [],
    hallucinations: [],
    traces: {},
    evaluations: [],
    connectionStatus: 'disconnected',
    selectedAgentId: null,

    setSelectedAgentId: (id) => set({ selectedAgentId: id }),
    setConnectionStatus: (status) => set({ connectionStatus: status }),

    updateMCTSTree: (agentId, tree) => set((state) => ({
      mctsTrees: { ...state.mctsTrees, [agentId]: tree }
    })),

    addOrUpdateClone: (clone) => set((state) => {
      const exists = state.clones.find((c) => c.id === clone.id);
      if (exists) {
        return { clones: state.clones.map((c) => (c.id === clone.id ? clone : c)) };
      }
      return { clones: [...state.clones, clone] };
    }),

    addHallucination: (alert) => set((state) => ({
      hallucinations: [alert, ...state.hallucinations].slice(0, 100)
    })),

    addTraceSpan: (agentId, span) => set((state) => {
      const agentTraces = state.traces[agentId] || [];
      return { traces: { ...state.traces, [agentId]: [...agentTraces, span] } };
    }),

    addEvaluation: (evaluation) => set((state) => ({
      evaluations: [evaluation, ...state.evaluations].slice(0, 500)
    })),

    fetchAgents: async () => {
      try {
        const agents = await api.listAgents();
        if (Array.isArray(agents)) {
          set({ clones: agents, connectionStatus: 'connected' });
        }
      } catch {
        set({ connectionStatus: 'disconnected' });
      }
    },

    fetchLineage: async () => {
      try {
        const lineage = await api.getLineage();
        if (lineage && lineage.nodes) {
          const rootNode: MCTSTreeNode = {
            id: 'dag-root',
            score: 0.95,
            visits: lineage.nodes.length,
            state: 'GenOS Master Swarm Lineage',
            children: lineage.nodes.map((n: any) => ({
              id: n.id,
              score: n.score || 0.85,
              visits: n.visits || 1,
              state: n.label || n.summary || 'Node State'
            }))
          };
          set((state) => ({
            mctsTrees: { ...state.mctsTrees, root: rootNode }
          }));
        }
      } catch {}
    },

    cloneAgent: async (agentId) => {
      try {
        await api.cloneNode(agentId);
        get().fetchAgents();
      } catch (err) {
        console.error('Failed to clone agent', err);
      }
    },

    inspectAgentDNA: async (agentId) => {
      try {
        await api.inspectNode(agentId);
      } catch (err) {
        console.error('Failed to inspect agent DNA', err);
      }
    },

    initializeLiveSync: () => {
      set({ connectionStatus: 'connecting' });
      get().fetchAgents();
      get().fetchLineage();

      // SSE Telemetry Listener
      let eventSource: EventSource | null = null;
      try {
        eventSource = new EventSource(`${API_BASE_URL}/api/telemetry`);
        eventSource.onopen = () => {
          set({ connectionStatus: 'connected' });
        };

        eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.eventType === 'AGENT_SPAWNED' || data.eventType === 'AGENT_STATE_CHANGE') {
              get().fetchAgents();
            }
            if (data.agentId && data.action) {
              get().addTraceSpan(data.agentId, {
                id: data.id || `trace-${Date.now()}`,
                name: data.action,
                startTime: Date.now(),
                outputs: data.detail || data.payload
              });
            }
          } catch {}
        };

        eventSource.onerror = () => {
          set({ connectionStatus: 'disconnected' });
        };
      } catch {
        set({ connectionStatus: 'disconnected' });
      }

      // Background Polling interval (every 4s)
      const interval = setInterval(() => {
        get().fetchAgents();
      }, 4000);

      return () => {
        if (eventSource) eventSource.close();
        clearInterval(interval);
      };
    }
  };
});
