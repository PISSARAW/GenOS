import React, { useState, useEffect } from 'react';
import { 
  Activity, Shield, Zap, Archive, FlaskConical, Flame, Target, Octagon,
  User
} from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

const FlatSparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  const max = Math.max(...data, 1);
  const points = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * 100;
    const y = 30 - (d / max) * 30;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="100%" height="40" viewBox="0 -5 100 40" style={{ overflow: 'visible', marginTop: '16px', marginBottom: '16px' }}>
      <polyline 
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const ActiveExperiments: React.FC<{ onOpenLab: () => void }> = ({ onOpenLab }) => {
  const [activeFilter, setActiveFilter] = useState('Recorded Protocols');
  const [backendExperiments, setBackendExperiments] = useState<any[]>([]);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    api.listExperiments()
      .then((data) => {
        if (Array.isArray(data)) setBackendExperiments(data);
      })
      .catch(() => {});
  }, []);

  const handleHaltNonCritical = async () => {
    try {
      await api.haltAll();
      showToast('warning', 'Global Halt Enabled', 'The backend kill switch is now engaged.');
    } catch (error: any) {
      showToast('error', 'Global Halt Failed', error?.message || 'The backend kill switch could not be engaged.');
    }
  };

  const filters = [
    { name: 'Recorded Protocols', icon: <Activity size={16} /> },
    { name: 'Security Ring', icon: <Shield size={16} /> },
    { name: 'Chaos Engineering', icon: <Zap size={16} /> },
    { name: 'Archives & Results', icon: <Archive size={16} /> }
  ];

  const mergedExperiments = backendExperiments.map((be) => ({
      id: be.id,
      title: be.title,
      type: be.type || 'Recorded Protocols',
      observations: Array.isArray(be.data) ? be.data.length : 0,
      color: be.color || '#58a6ff',
      data: Array.isArray(be.data) ? be.data : []
    }));

  const filteredExperiments = mergedExperiments.filter((exp) => {
    if (activeFilter === 'Recorded Protocols') return true;
    return exp.type === activeFilter;
  });

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg-main)', position: 'relative' }}>
      
      <div style={{ maxWidth: '1440px', margin: '32px auto', padding: '0 32px', display: 'flex', gap: '32px', position: 'relative', zIndex: 1 }}>
        
        {/* Left Sidebar Filters */}
        <div style={{ width: '256px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '8px' }}>
            {filters.map((f) => (
              <div 
                key={f.name}
                onClick={() => setActiveFilter(f.name)}
                style={{ 
                  padding: '8px 12px', 
                  cursor: 'pointer', 
                  borderRadius: '6px', 
                  fontSize: '0.85rem', 
                  color: activeFilter === f.name ? 'var(--text-primary)' : 'var(--text-secondary)', 
                  background: activeFilter === f.name ? 'var(--bg-subtle)' : 'transparent', 
                  fontWeight: activeFilter === f.name ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {f.icon} {f.name}
              </div>
            ))}
          </div>
        </div>

        {/* Main List Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Top Control Panel */}
          <div style={{ 
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
            padding: '16px 24px', background: 'var(--bg-panel)', 
            border: '1px solid var(--panel-border)', borderRadius: '6px'
          }}>
            
            <div style={{ display: 'flex', gap: '32px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <FlaskConical size={14} /> Active Experiments
                </span>
                <span style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>{mergedExperiments.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Flame size={14} /> Compute Burn Rate
                </span>
                <span style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  — <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 400 }}>/ hr</span>
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Target size={14} /> Success Rate (7d)
                </span>
                <span style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-secondary)' }}>—</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button onClick={handleHaltNonCritical} className="gh-btn" style={{ padding: '6px 16px', fontWeight: 600, color: 'var(--danger)', borderColor: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Octagon size={16} /> Engage MCP Kill Switch
              </button>
              <button onClick={onOpenLab} className="gh-btn gh-btn-primary" style={{ padding: '6px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FlaskConical size={16} /> Design Experiment
              </button>
            </div>

          </div>

          {/* Fluid Grid of Arenas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
            
            {filteredExperiments.map((exp) => (
              <div 
                key={exp.id}
                onClick={onOpenLab}
                className="hover-bg-gray"
                style={{ 
                  background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', 
                  padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column'
                }}
              >
                {/* Header */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', border: `1px solid ${exp.color}`, color: exp.color, fontSize: '0.7rem', fontWeight: 600, marginBottom: '8px', letterSpacing: '0.05em' }}>
                    [{exp.type.toUpperCase()}]
                  </div>
                  <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>{exp.title}</h3>
                </div>

                {/* Agent Arena */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: 'var(--bg-subtle)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <User size={14} color="var(--text-secondary)" />
                      </div>
                      Persisted protocol
                    </div>
                </div>

                {/* Sparkline */}
                <div style={{ flex: 1 }}>
                  <FlatSparkline data={exp.data} color={exp.color} />
                </div>

                {/* Progress */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
                    <span>Recorded observations</span>
                    <span style={{ color: 'var(--text-primary)' }}>{exp.observations}</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(exp.observations, 100)}%`, height: '100%', background: exp.color }}></div>
                  </div>
                </div>

              </div>
            ))}

          </div>

        </div>
      </div>
    </div>
  );
};
