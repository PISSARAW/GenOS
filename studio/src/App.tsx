import React, { useState, useEffect } from 'react';
import {
  Menu, ChevronDown, Activity as ActivityIcon, AlertOctagon,
  Terminal, Cpu, Swords, Wrench, Users, ShieldAlert, Dna, Database, GitBranch, Network, Bot, Bug, Workflow
} from 'lucide-react';
import { CommandPalette } from './components/CommandPalette';
import { Dashboard } from './components/Dashboard';
import { SwarmControlCenter } from './components/SwarmControlCenter';
import { IdeInspector } from './components/IdeInspector';
import { ExperimentsLab } from './components/ExperimentsLab';
import { AgentProfile } from './components/AgentProfile';
import { GlobalAlerts } from './components/GlobalAlerts';
import { PendingTrajectories } from './components/PendingTrajectories';
import { WorkspacesList } from './components/WorkspacesList';
import { ActiveExperiments } from './components/ActiveExperiments';
import { AgentDeployment } from './components/AgentDeployment';
import { FleetPage } from './components/FleetPage';
import { AgentsPage } from './components/AgentsPage';
import { TrinityAgentDeploy } from './components/TrinityAgentDeploy';
import { LiveMatrix } from './components/LiveMatrix';
import { GodModeTerminal } from './components/GodModeTerminal';
import { ToastContainer } from './components/ToastContainer';
import { RBAC_Gate } from './components/RBAC_Gate';
import { EvaluationLineageConsole } from './components/EvaluationLineageConsole';
import { SafeDebuggingDemo } from './components/SafeDebuggingDemo';
import './components/SafeDebuggingDemo.css';

// Product proof and breakthrough modules
import { ArenaSolversModule } from './components/arena/ArenaSolversModule';
import { McpSandboxModule } from './components/sandbox/McpSandboxModule';
import { SwarmMonitorModule } from './components/swarm/SwarmMonitorModule';
import { BiologyResilienceModule } from './components/resilience/BiologyResilienceModule';
import { GenomeFactoryModule } from './components/genome/GenomeFactoryModule';
import { MemoryExperienceModule } from './components/memory/MemoryExperienceModule';
import { WorkspaceTimelineModule } from './components/timeline/WorkspaceTimelineModule';
import { ComplianceAndIntegrations } from './components/ComplianceAndIntegrations';
import { PlatformSafetyCenter } from './components/PlatformSafetyCenter';
import { RagPlayground } from './components/RagPlayground';
import { StudioBuilder } from './components/StudioBuilder';

import { useGenOSStore } from './store/useGenOSStore';
import { useToastStore } from './store/useToastStore';
import { api } from './api/client';

type StudioView = 
  | 'home' | 'safe_debugging' | 'arena' | 'mcp_sandbox' | 'swarm_monitor' | 'resilience'
  | 'genome_factory' | 'memory_engine' | 'timeline_bisection'
  | 'rag_playground'
  | 'evaluation_lineage'
  | 'studio_builder' | 'topology' | 'timeline' | 'editor' | 'experiments' | 'active_experiments'
  | 'fleets' | 'agents' | 'agent_deployment' | 'trinity' | 'agent_profile' | 'alerts' | 'workspaces' 
  | 'live_matrix' | 'terminal' | 'compliance' | 'platform_safety';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<StudioView>('home');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [activeAgentsCount, setActiveAgentsCount] = useState<number | string>('Syncing...');
  const [workspaces, setWorkspaces] = useState<any[] | null>(null);
  const [repoSearch, setRepoSearch] = useState('');
  const initializeLiveSync = useGenOSStore((state) => state.initializeLiveSync);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    const unsubscribe = initializeLiveSync();

    const fetchStatus = async () => {
      try {
        const data = await api.getStatus();
        if (data?.activeAgentsCount !== undefined) {
          setActiveAgentsCount(data.activeAgentsCount);
        }
      } catch {
        setActiveAgentsCount('Offline');
      }
    };
    
    const fetchWorkspaces = async () => {
      try {
        const list = await api.listWorkspaces();
        if (Array.isArray(list)) setWorkspaces(list);
      } catch {
        setWorkspaces([]);
      }
    };

    fetchStatus();
    fetchWorkspaces();
    const interval = setInterval(fetchStatus, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [initializeLiveSync]);

  const handleHaltAll = async () => {
    try {
      await api.haltAll();
      showToast('warning', 'GLOBAL CRYPTOBIOSIS', 'Emergency halt broadcasted to all active swarm agents.');
    } catch (e: any) {
      showToast('error', 'Halt Failed', e.message);
    }
  };

  return (
    <>
      <CommandPalette />
      <ToastContainer />
      
      <div className="gh-layout">
        
        {/* TOPBAR */}
        <div className="gh-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '4px', cursor: 'pointer', border: '1px solid var(--panel-border)', borderRadius: '4px', display: 'flex', background: 'var(--bg-main)' }} onClick={() => setSidebarOpen(!isSidebarOpen)}>
              <Menu size={16} color="var(--text-secondary)" />
            </div>
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setActiveView('home')}>
              <img src="/genos-logo.png" width="28" height="28" alt="GenOS" style={{ objectFit: 'contain' }} />
            </div>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => setActiveView('home')}>GenOS Studio</span>
          </div>

          <div style={{ gap: '16px', display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px', background: 'var(--bg-main)', borderRadius: '20px', border: '1px solid var(--panel-border)' }}>
              <div style={{ paddingTop: '2px' }}><ActivityIcon size={14} color="#3fb950" className="pulse-green" /></div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>{activeAgentsCount} Agents</span>
            </div>

            <RBAC_Gate>
              <button 
                onClick={handleHaltAll}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '6px', 
                  background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
                }}
                className="hover-bg-red"
              >
                <AlertOctagon size={14} /> HALT ALL
              </button>
            </RBAC_Gate>
          </div>
        </div>

        <div className="gh-main-container">
          
          {/* SIDEBAR */}
          {isSidebarOpen && (
            <div className="gh-sidebar" style={{ padding: '16px' }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', marginBottom: '16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', background: 'var(--bg-main)', border: '1px solid var(--panel-border)' }}>
                <img src="/genos-logo.png" width="18" height="18" alt="" style={{ objectFit: 'contain' }} />
                PISSARAW / GenOS <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}/>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '16px' }}>
                <div onClick={() => setActiveView('home')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'home' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'home' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <HomeIcon size={16} color="var(--text-secondary)" /> Home Dashboard
                </div>

                <div onClick={() => setActiveView('studio_builder')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'studio_builder' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'studio_builder' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <Workflow size={16} color="var(--accent-blue)" /> Studio Builder
                </div>

                <div style={{ padding: '8px 8px 4px 8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Product Proof</div>

                <div onClick={() => setActiveView('safe_debugging')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'safe_debugging' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'safe_debugging' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <Bug size={16} color="var(--success)" /> Safe Parallel Debugging
                </div>

                <div style={{ padding: '8px 8px 4px 8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Breakthrough Modules</div>

                <div onClick={() => setActiveView('arena')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'arena' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'arena' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <Swords size={16} color="var(--accent-blue)" /> Arena & Solvers
                </div>
                <div onClick={() => setActiveView('evaluation_lineage')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'evaluation_lineage' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'evaluation_lineage' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <ActivityIcon size={16} color="var(--accent-purple)" /> Evaluation & Lineage
                </div>

                <div onClick={() => setActiveView('mcp_sandbox')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'mcp_sandbox' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'mcp_sandbox' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <Wrench size={16} color="var(--accent-blue)" /> MCP Sandbox & Tools
                </div>

                <div onClick={() => setActiveView('swarm_monitor')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'swarm_monitor' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'swarm_monitor' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <Users size={16} color="var(--success)" /> Swarm Monitor & Quorum
                </div>

                <div onClick={() => setActiveView('resilience')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'resilience' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'resilience' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <ShieldAlert size={16} color="var(--danger)" /> Biology & Resilience
                </div>

                <div onClick={() => setActiveView('genome_factory')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'genome_factory' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'genome_factory' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <Dna size={16} color="var(--accent-purple)" /> Genetics & Genome
                </div>

                <div onClick={() => setActiveView('memory_engine')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'memory_engine' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'memory_engine' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <Database size={16} color="var(--accent-blue)" /> Memory & Experience
                </div>
                <div onClick={() => setActiveView('rag_playground')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'rag_playground' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'rag_playground' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <SearchIcon size={16} color="var(--accent-blue)" /> RAG Playground
                </div>

                <div onClick={() => setActiveView('timeline_bisection')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'timeline_bisection' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'timeline_bisection' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <GitBranch size={16} color="var(--accent-blue)" /> Workspace Timeline & Diff
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--panel-border)', margin: '8px 0' }} />
                <div style={{ padding: '0 8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fleet Operations</div>

                <div onClick={() => setActiveView('fleets')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'fleets' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'fleets' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <Network size={16} color="var(--accent-blue)" /> Fleets
                </div>
                <div onClick={() => setActiveView('agents')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'agents' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'agents' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <Bot size={16} color="var(--success)" /> Agents
                </div>

                <div onClick={() => setActiveView('agent_deployment')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'agent_deployment' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'agent_deployment' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <IssueOpenedIcon size={16} color="var(--text-secondary)" /> Agent Deployment
                </div>
                <div onClick={() => setActiveView('trinity')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'trinity' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'trinity' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg> Agent Trinity
                </div>
                <div onClick={() => setActiveView('alerts')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'alerts' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'alerts' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <IssueIcon size={16} color="var(--text-secondary)" /> Global Alerts & Overrides
                </div>
                <div onClick={() => setActiveView('timeline')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'timeline' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'timeline' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <GitPullRequestIcon size={16} color="var(--text-secondary)" /> Pending Trajectories
                </div>
                <div onClick={() => setActiveView('workspaces')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'workspaces' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'workspaces' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <PackageIcon size={16} color="var(--text-secondary)" /> Workspaces List
                </div>
                <div onClick={() => setActiveView('compliance')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'compliance' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'compliance' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <ShieldAlert size={16} color="var(--accent-purple)" /> Compliance & IDEs
                </div>
                <div onClick={() => setActiveView('experiments')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'experiments' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'experiments' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <DiscussionIcon size={16} color="var(--text-secondary)" /> Experiments Lab
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--panel-border)', margin: '8px 0' }} />
                <div style={{ padding: '0 8px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Runtime Observers</div>
                
                <div onClick={() => setActiveView('live_matrix')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'live_matrix' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'live_matrix' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <Cpu size={16} color="#3fb950" /> Live Neural Matrix
                </div>
                <div onClick={() => setActiveView('platform_safety')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'platform_safety' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'platform_safety' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <ShieldAlert size={16} color="var(--warning)" /> Platform & Safety Center
                </div>
                <div onClick={() => setActiveView('terminal')} style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', background: activeView === 'terminal' ? 'var(--bg-subtle)' : 'transparent', fontWeight: activeView === 'terminal' ? 600 : 400, display: 'flex', alignItems: 'center', gap: '8px' }} className="hover-bg-gray">
                  <Terminal size={16} color="#f85149" /> God Mode Terminal
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--panel-border)', margin: '8px 0 16px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Workspaces</span>
              </div>
              <div style={{ marginBottom: '12px', padding: '0 8px' }}>
                <input 
                  type="text" 
                  placeholder="Find a workspace..." 
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.85rem', border: '1px solid var(--panel-border)', borderRadius: '6px', outline: 'none', background: 'var(--bg-main)', color: 'var(--text-primary)' }} 
                />
              </div>

              {/* Repo List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 8px' }}>
                {(workspaces || []).filter((repo) => (repo.title || repo.name || '').toLowerCase().includes(repoSearch.toLowerCase())).map((repo, i) => (
                  <div key={repo.id || repo.title || repo.name || i} onClick={() => setActiveView('workspaces')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)' }} className="hover-bg-gray">
                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: '#1f6feb', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontSize: '9px', fontWeight: 'bold' }}>G</div>
                    {repo.title || repo.name}
                  </div>
                ))}
              </div>

            </div>
          )}

          {/* MAIN CONTENT AREA */}
          <div className="gh-content-area">
            {activeView === 'home' && <Dashboard onNavigate={(v: any) => setActiveView(v)} workspacesCount={workspaces?.length ?? null} />}
            {activeView === 'studio_builder' && <StudioBuilder />}
            {activeView === 'safe_debugging' && <SafeDebuggingDemo />}
            {activeView === 'arena' && <ArenaSolversModule />}
            {activeView === 'evaluation_lineage' && <EvaluationLineageConsole />}
            {activeView === 'mcp_sandbox' && <McpSandboxModule />}
            {activeView === 'swarm_monitor' && <SwarmMonitorModule />}
            {activeView === 'resilience' && <BiologyResilienceModule />}
            {activeView === 'genome_factory' && <GenomeFactoryModule />}
            {activeView === 'memory_engine' && <MemoryExperienceModule />}
            {activeView === 'rag_playground' && <RagPlayground />}
            {activeView === 'timeline_bisection' && <WorkspaceTimelineModule />}
            {activeView === 'fleets' && <FleetPage />}
            {activeView === 'agents' && <AgentsPage onSelectAgent={() => setActiveView('agent_profile')} />}
            
            {activeView === 'agent_deployment' && <div style={{width:'100%', height:'100%'}}><AgentDeployment /></div>}
            {activeView === 'trinity' && <div style={{width:'100%', height:'100%'}}><TrinityAgentDeploy /></div>}
            {activeView === 'topology' && <div style={{width:'100%', height:'100%'}}><SwarmControlCenter onSelectAgent={() => setActiveView('agent_profile')} /></div>}
            {activeView === 'timeline' && <div style={{width:'100%', height:'100%'}}><PendingTrajectories /></div>}
            {activeView === 'editor' && <div style={{width:'100%', height:'100%'}}><IdeInspector code="// GenOS Runtime Engine\nexport const version = '2.0.0';" language="typescript" /></div>}
            {activeView === 'active_experiments' && <div style={{width:'100%', height:'100%'}}><ActiveExperiments onOpenLab={() => setActiveView('experiments')} /></div>}
            {activeView === 'experiments' && <div style={{width:'100%', height:'100%'}}><ExperimentsLab /></div>}
            {activeView === 'agent_profile' && <div style={{width:'100%', height:'100%'}}><AgentProfile /></div>}
            {activeView === 'alerts' && <div style={{width:'100%', height:'100%'}}><GlobalAlerts onNavigateDeploy={() => setActiveView('agent_deployment')} /></div>}
            {activeView === 'workspaces' && <div style={{width:'100%', height:'100%'}}><WorkspacesList /></div>}
            {activeView === 'compliance' && <ComplianceAndIntegrations />}
            {activeView === 'live_matrix' && <div style={{width:'100%', height:'100%'}}><LiveMatrix /></div>}
            {activeView === 'platform_safety' && <PlatformSafetyCenter />}
            {activeView === 'terminal' && <div style={{width:'100%', height:'100%'}}><GodModeTerminal /></div>}
          </div>

        </div>
      </div>
    </>
  );
};

// Clean SVG Icons
const GitPullRequestIcon = ({size, color}: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" y1="9" x2="6" y2="21"></line></svg>
);
const HomeIcon = ({size, color}: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
);
const SearchIcon = ({size, color}: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="16" y1="16" x2="21" y2="21"></line></svg>
);
const IssueIcon = ({size, color}: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
);
const PackageIcon = ({size, color}: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
);
const DiscussionIcon = ({size, color}: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
);
const IssueOpenedIcon = ({size, color}: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><circle cx="12" cy="16" r="1"></circle></svg>
);

export default App;
