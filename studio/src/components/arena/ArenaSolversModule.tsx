import React, { useState } from 'react';
import { Target, Trophy, FileText, Swords } from 'lucide-react';
import { ParetoFrontierView } from './ParetoFrontierView';
import { SolverTournament } from './SolverTournament';
import { ResolutionTracesInspector } from './ResolutionTracesInspector';

export const ArenaSolversModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pareto' | 'tournament' | 'traces'>('pareto');
  const [paretoRefreshKey, setParetoRefreshKey] = useState(0);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>

      {/* Top Banner */}
      <div style={{ padding: '20px 32px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Swords size={20} color="var(--accent-blue)" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Arena & Solvers Tournament</h1>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Multi-algorithm competitive solver runtime with Pareto Frontier optimization and trace auditing.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-main)', padding: '4px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
          <button
            onClick={() => setActiveTab('pareto')}
            style={{
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'pareto' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'pareto' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Target size={14} /> Pareto Frontier
          </button>
          <button
            onClick={() => setActiveTab('tournament')}
            style={{
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'tournament' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'tournament' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <Trophy size={14} /> Solver Tournament
          </button>
          <button
            onClick={() => setActiveTab('traces')}
            style={{
              padding: '6px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              background: activeTab === 'traces' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'traces' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <FileText size={14} /> Resolution Traces
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
        {activeTab === 'pareto' && <ParetoFrontierView refreshKey={paretoRefreshKey} />}
        {activeTab === 'tournament' && <SolverTournament onRunCompleted={() => setParetoRefreshKey((k) => k + 1)} />}
        {activeTab === 'traces' && <ResolutionTracesInspector />}
      </div>

    </div>
  );
};
