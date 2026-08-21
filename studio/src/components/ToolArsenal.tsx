import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldCheck, ChevronDown, Wrench, Terminal, X,
  Lock, Unlock, Play, Users, Brain
} from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';
import { getToolAlias } from '../utils/toolLabels';

export const ToolArsenal: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedTool, setSelectedTool] = useState<any>(null);
  const [simulatorQuery, setSimulatorQuery] = useState('');
  const [simulatorOutput, setSimulatorOutput] = useState<string[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [sandboxResult, setSandboxResult] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.showToast);

  const fetchToolList = () => {
    api.listTools()
      .then((data) => {
        if (Array.isArray(data)) setTools(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchToolList();
  }, []);

  const filters = [
    { name: 'All', icon: <Wrench size={16} /> },
    { name: 'Workspace Control', icon: <Terminal size={16} /> },
    { name: 'Experimental Labs', icon: <Play size={16} /> },
    { name: 'Resilience & Security', icon: <ShieldCheck size={16} /> },
    { name: 'Swarm Biomimicry', icon: <Users size={16} /> },
    { name: 'Cognitive & Debugging', icon: <Brain size={16} /> }
  ];

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulatorQuery || !selectedTool) return;
    const currentQuery = simulatorQuery;
    setSimulatorQuery('');
    setSimulatorOutput((prev) => [...prev, `> ${currentQuery}`, `[executing] Invoking ${selectedTool.name}...`]);

    try {
      const res = await api.testTool(selectedTool.name, { query: currentQuery });
      setSimulatorOutput((prev) => [...prev, `[response] ${res.result || 'Success: Command executed.'}`]);
    } catch (err: any) {
      setSimulatorOutput((prev) => [...prev, `[error] ${err.message || 'Execution halted.'}`]);
    }
  };

  const toggleLock = async (action: string) => {
    if (!selectedTool) return;
    const isCurrentlyLocked = selectedTool.isLocked;
    try {
      await api.toggleCircuitBreaker(action, !isCurrentlyLocked);
      showToast(isCurrentlyLocked ? 'success' : 'warning', 'Circuit Breaker Toggled', `Tool ${action} is now ${!isCurrentlyLocked ? 'LOCKED' : 'ACTIVE'}.`);
      fetchToolList();
      setSelectedTool((prev: any) => prev ? { ...prev, isLocked: !isCurrentlyLocked } : null);
    } catch (e: any) {
      showToast('error', 'Circuit Breaker Error', e.message);
    }
  };

  const testTool = async (tool: any) => {
    try {
      setSandboxResult(`Executing ${tool.name}...`);
      const data = await api.testTool(tool.name, {});
      setSandboxResult(data.result || `Success: ${tool.name} passed dry-run verification.`);
      showToast('success', 'Tool Verified', `${tool.name} executed cleanly in sandbox.`);
    } catch (e: any) {
      setSandboxResult(`Error: ${e.message}`);
      showToast('error', 'Test Failed', e.message);
    }
  };

  const handleEquip = async (tool: any) => {
    try {
      await api.equipTool(tool.name, ['Global Fleet']);
      showToast('success', 'Equipped', `${tool.name} equipped across all operational swarm nodes.`);
    } catch (e: any) {
      showToast('error', 'Equip Failed', e.message);
    }
  };

  const filteredTools = activeFilter === 'All' ? tools : tools.filter((t) => t.category === activeFilter);

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg-main)', position: 'relative' }}>
      
      {/* Header */}
      <div style={{ padding: '48px 32px', textAlign: 'center', background: 'var(--bg-panel)', borderBottom: '1px solid var(--panel-border)' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px 0' }}>MCP Tool & Skill Arsenal</h1>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
          Equip autonomous agents with servers and tools from the Model Context Protocol ecosystem. 
          Manage safety ratings, configure circuit breaker quarantine locks, and test in the proving ground.
        </p>
      </div>

      <div style={{ maxWidth: '1280px', margin: '32px auto', padding: '0 32px' }}>
        
        {/* Tactical Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {filters.map((f) => (
            <div 
              key={f.name}
              onClick={() => setActiveFilter(f.name)}
              style={{ 
                padding: '6px 14px', cursor: 'pointer', borderRadius: '20px', fontSize: '0.85rem', 
                color: activeFilter === f.name ? '#ffffff' : 'var(--text-secondary)', 
                background: activeFilter === f.name ? 'var(--accent-blue)' : 'var(--bg-panel)', 
                fontWeight: activeFilter === f.name ? 600 : 400,
                border: '1px solid',
                borderColor: activeFilter === f.name ? 'var(--accent-blue)' : 'var(--panel-border)',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              {f.icon} {f.name}
            </div>
          ))}
        </div>

        {/* Arsenal Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {filteredTools.map((tool) => (
            <div 
              key={tool.id || tool.name}
              onClick={() => setSelectedTool(tool)}
              className="hover-bg-gray"
              style={{ 
                background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', 
                padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.15rem', margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>{getToolAlias(tool.name)}</h3>
                
                {/* Risk Badge */}
                {tool.risk === 'Low' && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--success)', color: 'var(--success)' }}><ShieldCheck size={12} /> Low Risk</span>}
                {tool.risk === 'Amber' && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', border: '1px solid #d29922', color: '#d29922' }}><ShieldAlert size={12} /> Guarded</span>}
                {tool.risk === 'High' && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--danger)', color: 'var(--danger)' }}><ShieldAlert size={12} /> High Risk</span>}
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '24px', flex: 1, lineHeight: 1.5 }}>
                {tool.description}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button onClick={(e) => { e.stopPropagation(); testTool(tool); }} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                  Test Sandbox
                </button>
                <button onClick={(e) => { e.stopPropagation(); setSelectedTool(tool); }} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                  Configure
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>By {tool.provider}</div>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); handleEquip(tool); }}
                  className="gh-btn" 
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                >
                  Equip Agents <ChevronDown size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {sandboxResult && (
          <div style={{ marginTop: '24px', padding: '16px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: '#3fb950', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            &gt; {sandboxResult}
          </div>
        )}
      </div>

      {/* Drawer Overlay */}
      {selectedTool && (
        <div 
          onClick={() => { setSelectedTool(null); setSimulatorOutput([]); }}
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 100 }}
        />
      )}

      {/* Drawer Panel */}
      <div style={{ 
        position: 'fixed', top: 0, right: selectedTool ? 0 : '-800px', width: '800px', height: '100vh', 
        background: 'var(--bg-panel)', zIndex: 101, boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        borderLeft: '1px solid var(--panel-border)',
        transition: 'right 0.25s cubic-bezier(0.16, 1, 0.3, 1)', display: 'flex', flexDirection: 'column'
      }}>
        {selectedTool && (
          <>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-panel)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <h2 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-primary)' }}>{getToolAlias(selectedTool.name)}</h2>
                  {selectedTool.risk === 'High' && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--danger)', color: 'var(--danger)', fontWeight: 600 }}><ShieldAlert size={14} /> HIGH RISK</span>}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{selectedTool.description}</div>
              </div>
              <button onClick={() => { setSelectedTool(null); setSimulatorOutput([]); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, padding: '32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
              
              {/* Skill Matrix */}
              <div>
                <h3 style={{ fontSize: '1rem', margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Skill Matrix (MCP Actions)</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(selectedTool.actions || [selectedTool.name]).map((action: string) => (
                    <div key={action} style={{ 
                      padding: '6px 12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', 
                      color: 'var(--accent-blue)', fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 600
                    }}>
                      [{action}]
                    </div>
                  ))}
                </div>
              </div>

              {/* Training Simulator */}
              <div>
                <h3 style={{ fontSize: '1rem', margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Proving Ground (Dry-Run Simulator)</h3>
                <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '8px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Terminal size={14} color="var(--text-muted)" />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, fontFamily: 'monospace' }}>Test AI usage without deployment</span>
                  </div>
                  <div style={{ height: '180px', padding: '16px', overflowY: 'auto', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {simulatorOutput.map((line, i) => (
                      <div key={i} style={{ color: line.startsWith('>') ? 'var(--text-muted)' : line.startsWith('[response]') ? '#3fb950' : line.startsWith('[error]') ? '#f85149' : 'var(--text-primary)' }}>{line}</div>
                    ))}
                  </div>
                  <form onSubmit={handleSimulate} style={{ borderTop: '1px solid var(--panel-border)', display: 'flex' }}>
                    <input 
                      type="text" 
                      value={simulatorQuery}
                      onChange={(e) => setSimulatorQuery(e.target.value)}
                      placeholder="Give a test instruction (e.g. read schema)..."
                      style={{ flex: 1, padding: '10px 16px', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                    <button type="submit" style={{ padding: '0 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)' }}>
                      <Play size={16} />
                    </button>
                  </form>
                </div>
              </div>

              {/* Quarantine Control */}
              <div>
                <h3 style={{ fontSize: '1rem', margin: '0 0 8px 0', color: 'var(--text-primary)' }}>Rules of Engagement</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Set circuit breaker quarantine locks to prevent autonomous execution.</p>
                
                <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-main)' }}>
                  {(selectedTool.actions || [selectedTool.name]).map((action: string, i: number) => {
                    const isLocked = selectedTool.isLocked;
                    return (
                      <div key={action} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: i < (selectedTool.actions?.length || 1) - 1 ? '1px solid var(--panel-border)' : 'none' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{action}</div>
                        
                        <div 
                          onClick={() => toggleLock(action)}
                          style={{ 
                            cursor: 'pointer', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
                            background: isLocked ? 'rgba(248,81,73,0.15)' : 'rgba(35,134,54,0.15)',
                            color: isLocked ? 'var(--danger)' : 'var(--success)',
                            border: `1px solid ${isLocked ? 'var(--danger)' : 'var(--success)'}`
                          }}
                        >
                          {isLocked ? <><Lock size={12} /> Circuit Breaker Active</> : <><Unlock size={12} /> Allowed</>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </>
        )}
      </div>

    </div>
  );
};
