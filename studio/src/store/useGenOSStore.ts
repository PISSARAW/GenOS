import { create } from 'zustand';
import { api, subscribeApiEventStream } from '../api/client';
import { useToastStore } from './useToastStore';

export interface Clone {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'running' | 'completed' | 'blocked' | 'error' | 'terminated';
  agentType: 'GenOS' | 'Antigravity' | 'Codex' | 'ChatGPT' | 'Claude' | 'Other' | string;
  workspaceId?: string | null;
  workspaceName?: string | null;
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
  strategyPrimary?: string | null;
  strategyVersion?: number | null;
  strategyStatus?: string | null;
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

interface GenOSState {
  clones: Clone[];
  traces: Record<string, TraceSpan[]>;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  selectedAgentId: string | null;

  // Actions (all <= 3 parameters)
  setSelectedAgentId: (id: string | null) => void;
  setConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected') => void;
  addOrUpdateClone: (clone: Clone) => void;
  addTraceSpan: (agentId: string, span: TraceSpan) => void;

  // Backend Actions
  fetchAgents: () => Promise<void>;
  cloneAgent: (agentId: string) => Promise<void>;
  inspectAgentDNA: (agentId: string) => Promise<void>;
  initializeLiveSync: () => () => void;
}

export const useGenOSStore = create<GenOSState>((set, get) => {
  return {
    clones: [],
    traces: {},
    connectionStatus: 'disconnected',
    selectedAgentId: null,

    setSelectedAgentId: (id) => set({ selectedAgentId: id }),
    setConnectionStatus: (status) => set({ connectionStatus: status }),


    addOrUpdateClone: (clone) => set((state) => {
      const exists = state.clones.find((c) => c.id === clone.id);
      if (exists) {
        return { clones: state.clones.map((c) => (c.id === clone.id ? clone : c)) };
      }
      return { clones: [...state.clones, clone] };
    }),

    addTraceSpan: (agentId, span) => set((state) => {
      const agentTraces = state.traces[agentId] || [];
      return { traces: { ...state.traces, [agentId]: [...agentTraces, span] } };
    }),

    fetchAgents: async () => {
      try {
        // Bounded poll: the fleet table can grow unbounded, so the live sync
        // reads at most the 200 most recent agents instead of the full table.
        const agents = await api.listAgents({ limit: 200 });
        if (Array.isArray(agents)) {
          set({ clones: agents, connectionStatus: 'connected' });
        }
      } catch {
        set({ connectionStatus: 'disconnected' });
      }
    },


    cloneAgent: async (agentId) => {
      try {
        await api.cloneNode(agentId);
        get().fetchAgents();
      } catch (err) {
        useToastStore.getState().showToast('error', 'Clone Failed', err instanceof Error ? err.message : String(err));
      }
    },

    inspectAgentDNA: async (agentId) => {
      try {
        await api.inspectNode(agentId);
      } catch (err) {
        useToastStore.getState().showToast('error', 'DNA Inspection Failed', err instanceof Error ? err.message : String(err));
      }
    },

    initializeLiveSync: () => {
      set({ connectionStatus: 'connecting' });
      get().fetchAgents();

      let refetchTimer: ReturnType<typeof setTimeout> | null = null;
      const scheduleRefetch = () => {
        if (refetchTimer !== null) clearTimeout(refetchTimer);
        refetchTimer = setTimeout(() => {
          refetchTimer = null;
          void get().fetchAgents();
        }, 500);
      };

      // SSE Telemetry Listener — fetch-based stream so the Authorization
      // headers actually reach the protected telemetry endpoint.
      let closeStream: (() => void) | null = null;
      subscribeApiEventStream('/api/telemetry', {
        onOpen: () => {
          set({ connectionStatus: 'connected' });
        },
        onMessage: (data) => {
          try {
            if (data.eventType === 'AGENT_SPAWNED' || data.eventType === 'AGENT_STATE_CHANGE') {
              scheduleRefetch();
            }
            if (data.eventType === 'ORCHESTRATOR_USER_UPDATE' && data.payload?.audience === 'user') {
              const phase = String(data.payload?.phase || data.action || 'working').toLowerCase();
              const type = phase === 'completed' ? 'success' : phase === 'blocked' ? 'warning' : 'info';
              useToastStore.getState().showToast(type, `Orchestrator · ${phase}`, data.detail || 'Mission update');
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
        },
        onError: () => {
          set({ connectionStatus: 'disconnected' });
        }
      }).then((close) => {
        closeStream = close;
      });

      // Background Polling interval (every 4s)
      const interval = setInterval(() => {
        get().fetchAgents();
      }, 4000);

      return () => {
        closeStream?.();
        if (refetchTimer !== null) clearTimeout(refetchTimer);
        clearInterval(interval);
      };
    }
  };
});
