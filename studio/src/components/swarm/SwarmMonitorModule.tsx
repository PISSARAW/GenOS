import React, { useState } from 'react';
import { Activity, Network, Brain, Users } from 'lucide-react';
import { SwarmTopologyGraph } from './SwarmTopologyGraph';
import { CognitiveEntropyDrift } from './CognitiveEntropyDrift';
import { QuorumConsensusLive } from './QuorumConsensusLive';

export const SwarmMonitorModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'topology' | 'entropy' | 'quorum'>('topology');

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      
      {/* Header */}
      <div style={{ padding: '20px 32px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={20} color="#3fb950" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Swarm Consensus & Live Telemetry Observer</h1>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Real-time inter-agent messaging topology, Shannon entropy drift, and live supermajority quorum voting.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-main)', padding: '4px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
          <button 
            onClick={() => setActiveTab('topology')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'topology' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'topology' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Network size={14} /> Swarm Topology
          </button>
          <button 
            onClick={() => setActiveTab('entropy')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'entropy' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'entropy' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Brain size={14} /> Entropy Drift
          </button>
          <button 
            onClick={() => setActiveTab('quorum')}
            style={{ 
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'quorum' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'quorum' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Users size={14} /> Quorum Voting
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        {activeTab === 'topology' && <SwarmTopologyGraph />}
        {activeTab === 'entropy' && <CognitiveEntropyDrift />}
        {activeTab === 'quorum' && <QuorumConsensusLive />}
      </div>

    </div>
  );
};
