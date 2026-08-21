import React, { useEffect, useState } from 'react';
import { MessageSquare, GitBranch, Cpu, Activity } from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

export const TrinityAgentDeploy: React.FC = () => {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [prompt, setPrompt] = useState('');
  const [chat, setChat] = useState<{role: 'agent'|'user'; text: string}[]>([]);
  const [input, setInput] = useState('');
  const [worlds, setWorlds] = useState<any[]>([]);
  const showToast = useToastStore((state) => state.showToast);
  useEffect(() => { api.listTrinityWorlds().then((items: any[]) => { if (items?.length) { setWorlds(items); setStep(2); } }).catch(() => {}); }, []);

  const startInterview = () => {
    if (!prompt) return;
    setChat([
      { role: 'user', text: prompt },
      { role: 'agent', text: "Trinity Agent activated. Request received. Before generating the implementation plan: should this feature strictly replace existing behaviors or run in parallel as a new counterfactual fork?" }
    ]);
    setStep(1);
  };

  const handleSend = () => {
    if (!input) return;
    const newChat = [...chat, { role: 'user' as const, text: input }];
    setChat(newChat);
    setInput('');
    
    setTimeout(() => {
      setChat([...newChat, { role: 'agent', text: "Requirement confirmed. Generating implementation DAG and deploying 3 parallel counterfactual world states..." }]);
      setTimeout(() => startWorlds(), 1500);
    }, 800);
  };

  const startWorlds = async () => {
    setStep(2);
    try {
      const result = await api.deployTrinity({ prompt });
      const agentIds = Array.isArray(result?.agents) ? result.agents : [];
      setWorlds(result.worlds || agentIds.map((id: string) => ({ id, name: id, status: 'running', agentId: id })));
      showToast('success', 'Trinity Deployment', `${agentIds.length} backend agent(s) deployed.`);
    } catch {}
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%', background: 'var(--bg-main)' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <GitBranch size={28} color="var(--accent-purple)" />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Trinity Mode</h1>
      </div>

      {step === 0 && (
        <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', padding: '24px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Initialize Trinity Parallel Mission</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: 1.5 }}>
            The Trinity Agent interviews the operator to clarify mission parameters, then deploys 3 parallel branches to explore distinct implementation strategies.
          </p>
          <textarea 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the initial requirement..."
            style={{ width: '100%', height: '120px', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px', fontSize: '0.95rem', resize: 'none', outline: 'none', fontFamily: 'inherit', marginBottom: '16px', background: 'var(--bg-main)', color: 'var(--text-primary)' }}
          />
          <button 
            onClick={startInterview}
            className="gh-btn gh-btn-primary" 
            disabled={!prompt}
            style={{ padding: '8px 24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <MessageSquare size={16} /> Start Clarification Interview
          </button>
        </div>
      )}

      {step === 1 && (
        <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', height: '500px' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={16} color="var(--accent-purple)" /> <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Trinity Agent - Interview in Progress</span>
          </div>
          
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {chat.map((msg, i) => (
              <div key={i} style={{ 
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'user' ? 'rgba(56, 139, 253, 0.15)' : 'var(--bg-subtle)',
                border: '1px solid',
                borderColor: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--panel-border)',
                padding: '12px 16px', borderRadius: '6px', maxWidth: '80%', fontSize: '0.9rem',
                color: 'var(--text-primary)'
              }}>
                <div style={{ fontWeight: 600, fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                  {msg.role === 'user' ? 'Operator' : 'Trinity Agent'}
                </div>
                {msg.text}
              </div>
            ))}
          </div>

          <div style={{ padding: '16px', borderTop: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', display: 'flex', gap: '8px' }}>
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Reply to Trinity Agent..."
              style={{ flex: 1, border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '8px 12px', outline: 'none', background: 'var(--bg-main)', color: 'var(--text-primary)' }}
            />
            <button onClick={handleSend} className="gh-btn gh-btn-primary" style={{ padding: '8px 16px', fontWeight: 600 }}>Send</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {worlds.map((w) => (
              <div key={w.id} style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>{w.name}</span>
                {w.status === 'running' ? <Activity size={16} className="pulse-green" color="var(--success)" /> : <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>{w.status}</span>}
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{w.strategy || 'Deployment state is reported by the backend agent registry.'}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}><span>{w.status}</span><span>Agent: {w.agentName || w.agentId || '—'}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
