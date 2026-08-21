import React, { useState, useEffect, useRef } from 'react';
import { 
  Rocket, Activity, Ghost, Info, Bug, BookOpen, Layers, Play,
  Terminal, FolderSearch, FileText, Cpu
} from 'lucide-react';
import { api, API_BASE_URL } from '../api/client';
import { useToastStore } from '../store/useToastStore';

export const AgentDeployment: React.FC = () => {
  const [isDeployed, setIsDeployed] = useState(false);
  const [modelTier, setModelTier] = useState('Flash');
  const [workspaceIsolation, setWorkspaceIsolation] = useState('Branch');
  const [prompt, setPrompt] = useState('');
  
  const [telemetryLogs, setTelemetryLogs] = useState<{action: string; detail: string; time: string}[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [budget, setBudget] = useState<{percent: number; spent: string; total: string}>({percent: 18, spent: '$14.20', total: '$80.00'});
  const [scenarios, setScenarios] = useState<any>({ debug: '', explain: '', plan: '' });
  const logsEndRef = useRef<HTMLDivElement>(null);
  const showToast = useToastStore((state) => state.showToast);

  const fetchHistory = () => {
    api.getAgentHistory()
      .then((data) => {
        if (Array.isArray(data)) setHistory(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    api.getConfig()
      .then((data) => {
        if (data?.budget) setBudget(data.budget);
        if (data?.scenarios) setScenarios(data.scenarios);
      })
      .catch(() => {});

    fetchHistory();
  }, []);

  // Real telemetry via EventSource
  useEffect(() => {
    if (isDeployed) {
      const deploy = async () => {
        try {
          await api.deployAgent({ prompt, modelTier, workspaceIsolation });
          showToast('success', 'Agent Deployed', `Subagent launched with ${modelTier} tier in ${workspaceIsolation} isolation.`);
          fetchHistory();
        } catch (e: any) {
          showToast('error', 'Deployment Failed', e.message);
        }
      };
      deploy();

      let eventSource: EventSource | null = null;
      try {
        eventSource = new EventSource(`${API_BASE_URL}/api/telemetry`);
        
        eventSource.onmessage = (event) => {
          try {
            const log = JSON.parse(event.data);
            setTelemetryLogs((prev) => [...prev, { 
              action: log.action || log.eventType || 'system', 
              detail: log.detail || log.message || JSON.stringify(log.payload || ''), 
              time: new Date().toLocaleTimeString() 
            }]);
          } catch {}
        };

        eventSource.onerror = () => {
          eventSource?.close();
        };
      } catch {}

      return () => {
        eventSource?.close();
      };
    } else {
      setTelemetryLogs([]);
    }
  }, [isDeployed, prompt, modelTier, workspaceIsolation]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [telemetryLogs]);

  const handleQuickSpawn = (type: string) => {
    if (type === 'debug') {
      setPrompt(scenarios.debug || 'Debug current workspace errors and run test suites.');
      setModelTier('Pro');
      setWorkspaceIsolation('Branch');
    } else if (type === 'explain') {
      setPrompt(scenarios.explain || 'Explain the workspace architecture and component lineage.');
      setModelTier('Flash Lite');
      setWorkspaceIsolation('Inherit');
    } else if (type === 'plan') {
      setPrompt(scenarios.plan || 'Create a step-by-step implementation plan for new features.');
      setModelTier('Flash');
      setWorkspaceIsolation('Inherit');
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--bg-main)' }}>
      
      {/* Left Sidebar */}
      <div style={{ width: '280px', borderRight: '1px solid var(--panel-border)', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px' }}>
          <button 
            onClick={() => setIsDeployed(false)}
            className="gh-btn" 
            style={{ width: '100%', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start', background: 'var(--bg-subtle)' }}
          >
            <Rocket size={16} color="var(--accent-blue)" /> New Agent Deployment
          </button>
        </div>

        <div style={{ padding: '0 16px', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Active Subagents & Fleet History
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {history.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No active subagents.
              </div>
            ) : (
              history.map((agent, idx) => (
                <div key={agent.id || idx} style={{ padding: '8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', gap: '8px' }} className="hover-bg-gray">
                  <div style={{ paddingTop: '2px' }}>
                    {agent.status === 'Active' || agent.status === 'running'
                      ? <Activity size={14} color="var(--success)" className="pulse-green" />
                      : <Ghost size={14} color="var(--danger)" />}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{agent.name}</div>
                    <div style={{ fontSize: '0.75rem', color: agent.status === 'Active' || agent.status === 'running' ? 'var(--text-secondary)' : 'var(--danger)' }}>
                      {agent.status} · {agent.id?.substring(0, 8)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        
        {/* Budget Alert Box */}
        <div style={{ padding: '24px 32px 0 32px' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid #1f6feb', borderRadius: '6px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-blue)', fontSize: '0.85rem' }}>
              <Info size={16} />
              <span>Fleet Compute Burn Rate: <strong>{budget.percent}% of quota consumed</strong> ({budget.spent} / {budget.total}).</span>
            </div>
            <button onClick={() => showToast('info', 'Limits', 'Quota adjusted')} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>Increase limits</button>
          </div>
        </div>

        {/* Center Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
          
          {!isDeployed ? (
            <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <Rocket size={48} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
                <h1 style={{ fontSize: '1.5rem', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>Define Mission Parameters</h1>
              </div>

              {/* The Deployment Console */}
              <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', overflow: 'hidden' }}>
                
                {/* Textarea */}
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Give your subagent a background task to complete..."
                  style={{ width: '100%', height: '120px', border: 'none', borderBottom: '1px solid var(--panel-border)', padding: '16px', fontSize: '0.95rem', resize: 'none', outline: 'none', fontFamily: 'inherit', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
                />

                {/* Configuration Bar */}
                <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  
                  <div style={{ display: 'flex', gap: '24px' }}>
                    {/* Model Tier */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Model Tier</span>
                      <div style={{ display: 'flex', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '2px' }}>
                        {['Flash Lite', 'Flash', 'Pro'].map((t) => (
                          <div 
                            key={t}
                            onClick={() => setModelTier(t)}
                            style={{ 
                              padding: '4px 12px', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px',
                              background: modelTier === t ? 'var(--accent-blue)' : 'transparent',
                              fontWeight: modelTier === t ? 600 : 400, 
                              color: modelTier === t ? '#ffffff' : 'var(--text-secondary)'
                            }}
                          >
                            {t}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Workspace Isolation */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Workspace Isolation</span>
                      <div style={{ display: 'flex', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '2px' }}>
                        {['Inherit', 'Branch'].map((i) => (
                          <div 
                            key={i}
                            onClick={() => setWorkspaceIsolation(i)}
                            style={{ 
                              padding: '4px 12px', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '4px',
                              background: workspaceIsolation === i ? 'var(--accent-blue)' : 'transparent',
                              fontWeight: workspaceIsolation === i ? 600 : 400, 
                              color: workspaceIsolation === i ? '#ffffff' : 'var(--text-secondary)'
                            }}
                          >
                            {i}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => { if (prompt) setIsDeployed(true); }}
                    className="gh-btn gh-btn-primary" 
                    disabled={!prompt}
                    style={{ padding: '6px 20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Play size={14} /> Deploy Subagent
                  </button>

                </div>
              </div>

              {/* Quick Spawns */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '8px' }}>
                <button onClick={() => handleQuickSpawn('debug')} className="gh-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <Bug size={14} color="var(--text-secondary)" /> Debug error
                </button>
                <button onClick={() => handleQuickSpawn('explain')} className="gh-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <BookOpen size={14} color="var(--text-secondary)" /> Explain codebase
                </button>
                <button onClick={() => handleQuickSpawn('plan')} className="gh-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <Layers size={14} color="var(--text-secondary)" /> Create architecture plan
                </button>
              </div>

            </div>
          ) : (
            
            // Agent Telemetry (Post-Deployment)
            <div style={{ width: '100%', maxWidth: '800px', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', margin: '0 0 4px 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={20} color="var(--success)" className="pulse-green" /> 
                    Mission in progress
                  </h2>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Agent is working autonomously in the background. Stream will continue logging.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ fontSize: '0.75rem', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', padding: '4px 8px', borderRadius: '4px', fontWeight: 600, color: 'var(--text-primary)' }}>Model: {modelTier}</div>
                  <div style={{ fontSize: '0.75rem', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', padding: '4px 8px', borderRadius: '4px', fontWeight: 600, color: 'var(--text-primary)' }}>Isolation: {workspaceIsolation}</div>
                </div>
              </div>

              {/* Telemetry Terminal */}
              <div style={{ flex: 1, background: '#0d1117', borderRadius: '6px', border: '1px solid var(--panel-border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-panel)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Terminal size={14} color="var(--text-muted)" />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, fontFamily: 'monospace' }}>Agent Telemetry Stream</span>
                </div>
                
                <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  {telemetryLogs.map((log, i) => (
                    <div key={i} style={{ display: 'flex', gap: '16px', color: '#c9d1d9' }}>
                      <span style={{ color: 'var(--text-muted)', minWidth: '70px' }}>{log.time}</span>
                      
                      <span style={{ 
                        color: log.action === 'think' ? '#bc8cff' : log.action === 'AGENT_SPAWNED' ? '#58a6ff' : '#3fb950',
                        fontWeight: 600, minWidth: '100px'
                      }}>
                        [{log.action}]
                      </span>
                      
                      <span style={{ flex: 1 }}>
                        {log.action === 'tool_call' ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {log.detail.includes('list_dir') && <FolderSearch size={12} />}
                            {log.detail.includes('view_file') && <FileText size={12} />}
                            {log.detail.includes('write_to_file') && <Cpu size={12} />}
                            {log.detail}
                          </span>
                        ) : log.detail}
                      </span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>

          )}

        </div>
      </div>
    </div>
  );
};
