import React, { useState } from 'react';
import { 
  Code, CircleDot, GitPullRequest, LayoutGrid, Book, PlayCircle, Shield,
  ShieldCheck
} from 'lucide-react';
import { useGenOSStore } from '../store/useGenOSStore';
import { useToastStore } from '../store/useToastStore';
import { AgentProfileHeader } from './agent-profile/AgentProfileHeader';
import { AgentProfileState } from './agent-profile/AgentProfileState';
import { AgentProfileTasks } from './agent-profile/AgentProfileTasks';
import { AgentProfileMemory } from './agent-profile/AgentProfileMemory';
import { AgentProfileSidebar } from './agent-profile/AgentProfileSidebar';

export const AgentProfile: React.FC = () => {
  const [activeTab, setActiveTab] = useState('state');
  const clones = useGenOSStore((state) => state.clones);
  const traces = useGenOSStore((state) => state.traces);
  const selectedAgentId = useGenOSStore((state) => state.selectedAgentId);
  const fetchAgents = useGenOSStore((state) => state.fetchAgents);
  const showToast = useToastStore((state) => state.showToast);
  
  const activeAgent = (selectedAgentId ? clones.find((c) => c.id === selectedAgentId) : null) || clones[0] || { 
    id: 'agent_primary', 
    name: 'Antigravity (Orchestrator)', 
    status: 'running', 
    role: 'System Architect', 
    currentTask: 'Supervising GenOS Studio Fleet' 
  };

  const agentTraces = traces[activeAgent.id] || [];
  
  const displayFiles = agentTraces.slice(-5).map((t) => ({
    type: (t.inputs?.path && t.inputs.path.includes('.')) ? 'file' : 'folder',
    name: t.inputs?.path || t.name,
    message: t.outputs ? (typeof t.outputs === 'string' ? t.outputs.substring(0, 50) : JSON.stringify(t.outputs).substring(0, 50)) : 'Task completed',
    time: new Date(t.startTime).toLocaleTimeString()
  }));

  const fallbackFiles = displayFiles.length > 0 ? displayFiles : [
    { type: 'folder', name: 'src/components', message: 'Refactoring layout for AgentProfile', time: '2 mins ago' },
    { type: 'file', name: 'src/components/AgentProfile.tsx', message: 'Modular subcomponents refactor', time: '4 mins ago' },
    { type: 'file', name: 'src/App.tsx', message: 'Fix TypeError on repo.name fallback', time: '12 mins ago' },
    { type: 'file', name: 'backend/src/app.js', message: 'Update MCP tool categorizer logic', time: '25 mins ago' },
    { type: 'file', name: 'package.json', message: 'Update dependencies for GenOS 2.0', time: '1 hr ago' },
  ];

  const tabs = [
    { id: 'state', label: 'State & Files', icon: Code },
    { id: 'tasks', label: 'Tasks', icon: CircleDot, count: agentTraces.length || 4 },
    { id: 'trajectories', label: 'Trajectories', icon: GitPullRequest, count: 2 },
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
        clonesCount={clones.length}
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
              snapshotsCount={agentTraces.filter((t) => t.name === 'genos_snapshot').length || 1}
              displayFiles={fallbackFiles}
              agentTracesCount={agentTraces.length}
            />
          )}

          {activeTab === 'tasks' && (
            <AgentProfileTasks traces={agentTraces} />
          )}

          {activeTab === 'trajectories' && (
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
              <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '6px 6px 0 0' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <GitPullRequest size={16} color="var(--text-muted)" /> Counterfactual Timelines (Forks)
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[
                  { title: 'Timeline: Optimize Swarm Topology', time: '2 hours ago', base: 'b4f91a2', delta: '+12 files, -3 files', nodes: 4 },
                  { title: 'Timeline: Security Vulnerability Patching', time: '5 hours ago', base: 'c9e33f1', delta: '+2 files, -1 file', nodes: 1 },
                ].map((tl, i) => (
                  <div key={i} style={{ borderBottom: i === 0 ? '1px solid var(--panel-border)' : 'none', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="hover-bg-gray">
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', fontSize: '0.95rem' }} className="hover-blue">{tl.title}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Forked {tl.time} from <span style={{ fontFamily: 'monospace' }}>{tl.base}</span></div>
                    </div>
                    <button className="gh-btn" onClick={() => showToast('info', 'Timeline Explorer', 'Navigating to timeline')}>Inspect Timeline</button>
                  </div>
                ))}
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
                {clones.map((node, i) => (
                  <div key={node.id || i} style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < clones.length - 1 ? '1px solid var(--panel-border)' : 'none' }} className="hover-bg-gray">
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
            <AgentProfileMemory activeAgent={activeAgent} />
          )}

          {activeTab === 'experiments' && (
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <PlayCircle size={48} style={{ margin: '0 auto 16px auto', display: 'block', opacity: 0.3 }} />
              <h2 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '8px' }}>Proving Ground Ready</h2>
              <p>Allocate this agent to active experiments via the Experiments Lab.</p>
            </div>
          )}

          {activeTab === 'health' && (
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                <ShieldCheck size={20} color="var(--success)" /> Diagnostics Nominal
              </h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <li style={{ padding: '12px 0', borderBottom: '1px solid var(--panel-border)' }}><strong>CPU Allocation:</strong> 0.2 vCPU</li>
                <li style={{ padding: '12px 0', borderBottom: '1px solid var(--panel-border)' }}><strong>Memory Footprint:</strong> 128 MB</li>
                <li style={{ padding: '12px 0', borderBottom: '1px solid var(--panel-border)' }}><strong>Network I/O:</strong> Sandboxed (Localhost only)</li>
                <li style={{ padding: '12px 0' }}><strong>Apoptosis Risk:</strong> Low</li>
              </ul>
            </div>
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
