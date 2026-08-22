import React, { useState } from 'react';
import { ShieldAlert, Skull, Snowflake, Zap } from 'lucide-react';
import { AdaptiveApoptosisPanel } from './AdaptiveApoptosisPanel';
import { CryptobiosisManager } from './CryptobiosisManager';
import { CircuitBreakerHealthMatrix } from './CircuitBreakerHealthMatrix';

export const BiologyResilienceModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'apoptosis' | 'cryptobiosis' | 'matrix'>('apoptosis');

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      
      {/* Header */}
      <div style={{ padding: '20px 32px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={20} color="var(--danger)" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Biology, Resilience & Biomimicry Station</h1>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Persisted apoptosis policy and MCP safety status. Durable swarm hibernation is unavailable in this deployment.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-main)', padding: '4px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
          <button 
            onClick={() => setActiveTab('apoptosis')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'apoptosis' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'apoptosis' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Skull size={14} /> Adaptive Apoptosis
          </button>
          <button 
            onClick={() => setActiveTab('cryptobiosis')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'cryptobiosis' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'cryptobiosis' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Snowflake size={14} /> Cryptobiosis (.cryo)
          </button>
          <button 
            onClick={() => setActiveTab('matrix')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'matrix' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'matrix' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Zap size={14} /> Health Matrix
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        {activeTab === 'apoptosis' && <AdaptiveApoptosisPanel />}
        {activeTab === 'cryptobiosis' && <CryptobiosisManager />}
        {activeTab === 'matrix' && <CircuitBreakerHealthMatrix />}
      </div>

    </div>
  );
};
