import React, { useState } from 'react';
import { 
  Code, CircleDot, GitPullRequest, LayoutGrid, Book, PlayCircle, Shield,
  ShieldCheck
} from 'lucide-react';
import { useGenOSStore } from '../store/useGenOSStore';
import { AgentProfileHeader } from './agent-profile/AgentProfileHeader';
import { AgentProfileState } from './agent-profile/AgentProfileState';
import { AgentProfileTasks } from './agent-profile/AgentProfileTasks';
import { AgentProfileMemory } from './agent-profile/AgentProfileMemory';
import { AgentProfileSidebar } from './agent-profile/AgentProfileSidebar';
import { AgentProfileHealth } from './agent-profile/AgentProfileHealth';
import { AgentStrategyContract } from './agent-profile/AgentStrategyContract';

export const AgentProfile: React.FC = () => {
  const [activeTab, setActiveTab] = useState('state');
  const clones = useGenOSStore((state) => state.clones);
  const traces = useGenOSStore((state) => state.traces);
  const selectedAgentId = useGenOSStore((state) => state.selectedAgentId);
  const fetchAgents = useGenOSStore((state) => state.fetchAgents);
  
  const activeAgent = selectedAgentId ? clones.find((c) => c.id === selectedAgentId) || null : null;

  if (!activeAgent) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', color: 'var(--text-secondary)' }}>
        {clones.length === 0 ? 'No agent data available.' : 'Select an agent'}
      </div>
    );
  }

  const agentTraces = traces[activeAgent.id] || [];
  const visibleAgents = clones.filter((agent) => {
    if (agent.id === activeAgent.id) return true;
    const sameWorkspace = Boolean(activeAgent.workspaceId && agent.workspaceId === activeAgent.workspaceId);
    const sameFleet = Boolean(activeAgent.fleetId && agent.fleetId === activeAgent.fleetId);
    const parentChild = agent.parentAgentId === activeAgent.id || activeAgent.parentAgentId === agent.id;
    return sameWorkspace || sameFleet || parentChild;
  });
  
  const displayFiles = agentTraces.slice(-5).map((t) => ({
    type: (t.inputs?.path && t.inputs.path.includes('.')) ? 'file' : 'folder',
    name: t.inputs?.path || t.name,
    message: t.outputs ? (typeof t.outputs === 'string' ? t.outputs.substring(0, 50) : JSON.stringify(t.outputs).substring(0, 50)) : 'Task completed',
    time: new Date(t.startTime).toLocaleTimeString()
  }));

  const tabs = [
    { id: 'state', label: 'State & Files', icon: Code },
    { id: 'strategy', label: 'Strategy Contract', icon: ShieldCheck },
    { id: 'tasks', label: 'Tasks', icon: CircleDot, count: agentTraces.length },
    { id: 'trajectories', label: 'Trajectories', icon: GitPullRequest, count: agentTraces.length },
    { id: 'swarm', label: 'Swarm & Network', icon: LayoutGrid },
    { id: 'memory', label: 'Memory & Genome', icon: Book },
    { id: 'experiments', label: 'Experiments', icon: PlayCircle },
    { id: 'health', label: 'Health & Diagnostics', icon: Shield },
  ];

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg-main)' }}>
      
      {/* HEADER ZONE */}
      <AgentProfileHeader
        activeAgent={activeAgent}
        clonesCount={visibleAgents.filter((agent) => agent.parentAgentId === activeAgent.id).length}
        activeTab={activeTab}
        tabs={tabs}
        onSelectTab={setActiveTab}
        onRefreshClones={fetchAgents}
      />

      {/* MAIN CONTENT ZONE */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 32px', display: 'flex', gap: '24px' }}>
        
        {/* Left Column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {activeTab === 'state' && (
            <AgentProfileState
              activeAgent={activeAgent}
              clonesCount={clones.length}
              snapshotsCount={agentTraces.filter((t) => t.name === 'genos_snapshot').length}
              displayFiles={displayFiles}
              agentTraces={agentTraces}
              agentTracesCount={agentTraces.length}
            />
          )}

          {activeTab === 'tasks' && (
            <AgentProfileTasks traces={agentTraces} />
          )}

          {activeTab === 'strategy' && (
            <AgentStrategyContract key={activeAgent.id} agentId={activeAgent.id} />
          )}

          {activeTab === 'trajectories' && (
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
              <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '6px 6px 0 0' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <GitPullRequest size={16} color="var(--text-muted)" /> Counterfactual Timelines (Forks)
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {agentTraces.length === 0 && !activeAgent.currentTask && (
                  <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>No persisted or active trajectory recorded for this agent.</div>
                )}
                {activeAgent.currentTask && (
                  <div style={{ padding: '16px', borderBottom: agentTraces.length ? '1px solid var(--panel-border)' : 'none' }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Current execution</div>
                    <div style={{ marginTop: '6px', color: 'var(--text-secondary)' }}>{activeAgent.currentTask}</div>
                    <div style={{ marginTop: '6px', color: activeAgent.status === 'running' ? 'var(--success)' : 'var(--text-secondary)', fontSize: '0.8rem' }}>{activeAgent.status} · source: agent state</div>
                  </div>
                )}
              {agentTraces.map((trace, index) => {
                  const output = trace.outputs ? (typeof trace.outputs === 'string' ? trace.outputs : JSON.stringify(trace.outputs)) : '';
                  return (
                    <div key={trace.id || index} style={{ padding: '16px', borderBottom: index < agentTraces.length - 1 ? '1px solid var(--panel-border)' : 'none' }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{trace.name || 'Agent action'}</div>
                      <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{output || 'Action recorded without output.'}</div>
                      <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{trace.startTime ? new Date(trace.startTime).toLocaleTimeString() : 'timestamp unavailable'} · runtime observer span</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'swarm' && (
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
              <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', borderRadius: '6px 6px 0 0' }}>
                <h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <LayoutGrid size={16} color="var(--text-muted)"/> Active Swarm Fleet
                </h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {visibleAgents.map((node, i) => (
                  <div key={node.id || i} style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < visibleAgents.length - 1 ? '1px solid var(--panel-border)' : 'none' }} className="hover-bg-gray">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#1f6feb', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                        {node.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{node.name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{node.role}</div>
                      </div>
                    </div>
                    <span style={{ border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: node.status === 'running' ? 'var(--success)' : 'var(--text-muted)' }}></div> {node.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <AgentProfileMemory activeAgent={activeAgent} traces={agentTraces} />
          )}

          {activeTab === 'experiments' && (
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
              <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)' }}>
                <h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}><PlayCircle size={16} color="var(--text-muted)" /> Live Experiment Activity</h2>
              </div>
              {activeAgent.currentTask && <div style={{ padding: '16px', borderBottom: agentTraces.length ? '1px solid var(--panel-border)' : 'none' }}><div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Active assignment</div><div style={{ marginTop: '6px', color: 'var(--text-secondary)' }}>{activeAgent.currentTask}</div><div style={{ marginTop: '6px', color: activeAgent.status === 'running' ? 'var(--success)' : 'var(--text-secondary)', fontSize: '0.8rem' }}>{activeAgent.status} · source: agent state</div></div>}
              {agentTraces.map((trace, index) => <div key={trace.id || index} style={{ padding: '16px', borderBottom: index < agentTraces.length - 1 ? '1px solid var(--panel-border)' : 'none' }}><div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{trace.name || 'Agent action'}</div><div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{trace.outputs ? (typeof trace.outputs === 'string' ? trace.outputs : JSON.stringify(trace.outputs)) : 'No output recorded.'}</div><div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{trace.startTime ? new Date(trace.startTime).toLocaleTimeString() : 'timestamp unavailable'} · runtime observer span</div></div>)}
              {!activeAgent.currentTask && agentTraces.length === 0 && <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>No experiment assignment or execution trace recorded for this agent.</div>}
            </div>
          )}

          {activeTab === 'health' && (
            <AgentProfileHealth activeAgent={activeAgent} />
          )}

        </div>

        {/* Right Sidebar */}
        <AgentProfileSidebar
          activeAgent={activeAgent}
          clonesCount={clones.length}
          onSelectTab={setActiveTab}
        />

      </div>
    </div>
  );
};
