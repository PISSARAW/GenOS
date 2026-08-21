import React from 'react';
import { Book, CheckCircle, Database } from 'lucide-react';

interface AgentProfileMemoryProps {
  activeAgent: any;
}

export const AgentProfileMemory: React.FC<AgentProfileMemoryProps> = ({ activeAgent }) => {
  const memoryStream = [
    { content: "User confirmed strict flat GitHub dark aesthetic requirement for GenOS Studio.", type: "User Policy", time: "Just now" },
    { content: "Mapped all 18 normalized SQLite schema tables into UI telemetry bindings.", type: "Code Architecture", time: "1 hr ago" },
    { content: "Verified Level 5 military override authentication and anti-CSRF protections.", type: "Security Verification", time: "2 hrs ago" }
  ];

  return (
    <div style={{ display: 'flex', gap: '24px' }}>
      
      <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', borderRadius: '6px 6px 0 0' }}>
            <h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Book size={16} color="var(--text-muted)"/> Genome Evolution (Learned Rules)
            </h2>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ color: 'var(--success)', paddingTop: '2px' }}><CheckCircle size={16} /></div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Esthétique Stricte Inviolable (Rule #5)</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
                  Learned to strictly apply GitHub utilitarian design across all components. Gradients, massive border-radiuses, and glossy aesthetics are strictly forbidden.
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>Mutated from `AGENTS.md`</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
              <div style={{ color: 'var(--success)', paddingTop: '2px' }}><CheckCircle size={16} /></div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Co-évolution Frontend (Rule #4)</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
                  Authorized to evolve React components to improve data efficiency, respecting Rule #5.
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>Mutated from `AGENTS.md`</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', borderRadius: '6px 6px 0 0' }}>
            <h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} color="var(--text-muted)"/> Vector Memory Stream
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {memoryStream.map((mem, i) => (
              <div key={i} style={{ padding: '12px 16px', borderBottom: i < memoryStream.length - 1 ? '1px solid var(--panel-border)' : 'none', display: 'flex', gap: '12px' }} className="hover-bg-gray">
                <div style={{ paddingTop: '2px' }}><Database size={14} color="var(--text-muted)" /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>{mem.content}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{mem.type}</span> · {mem.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Context Window</h3>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            <span>Saturation</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>64,120 / 128,000 tokens</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ width: '50%', height: '100%', background: '#1f6feb' }}></div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}><span style={{ color: '#58a6ff' }}>■</span> Conversation</span>
              <span style={{ color: 'var(--text-primary)' }}>32.4k</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}><span style={{ color: '#238636' }}>■</span> File Artifacts</span>
              <span style={{ color: 'var(--text-primary)' }}>25.1k</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}><span style={{ color: '#bc8cff' }}>■</span> Tool Results</span>
              <span style={{ color: 'var(--text-primary)' }}>6.6k</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Agent Identity</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Genome Version</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>GenOS-v2.0.0</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Base Model</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{activeAgent.agentType || 'flash-lite'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Memory Vectors</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>184 Active</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
