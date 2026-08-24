import React, { useEffect, useState } from 'react';
import { Award, Sparkles } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

interface TrajectoryTurn {
  id: string;
  stepNum: number;
  type: 'Exploration' | 'Breakthrough' | 'Dead-End' | 'Verification';
  action: string;
  selected: boolean;
}

export const GoldenPathCherryPicker: React.FC = () => {
  const [turns, setTurns] = useState<TrajectoryTurn[]>([]);
  const [goldenLabel, setGoldenLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    api.getTrajectories()
      .then((data: any) => {
        const trajectories = [...(data?.pendingList || []), ...(data?.activeList || [])];
        const loadedTurns = trajectories.flatMap((trajectory: any) => {
          const lines = Array.isArray(trajectory.diffLines) ? trajectory.diffLines : [];
          return lines.map((line: any, index: number) => ({
            id: `${trajectory.id}:${index}`,
            stepNum: index + 1,
            type: line.type || (line.error ? 'Dead-End' : line.success || line.pass ? 'Breakthrough' : 'Exploration'),
            action: line.action || line.content || line.text || String(line),
            selected: false
          }));
        });
        setTurns(loadedTurns);
      })
      .catch(() => showToast('error', 'Trajectory Load Failed', 'Unable to load persisted trajectories.'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const toggleSelect = (id: string) => {
    setTurns((prev) => prev.map((t) => t.id === id ? { ...t, selected: !t.selected } : t));
  };

  const handleSynthesize = async () => {
    const selectedTurns = turns.filter((t) => t.selected);
    if (selectedTurns.length === 0) return;
    try {
      const res = await api.cherryPickGoldenPath({
        turns: selectedTurns,
        label: goldenLabel
      });
      showToast('success', 'Golden Path Synthesized', `Classified ${selectedTurns.length} selected steps into synthesis ${res?.synthesisId || ''}. The synthesis is returned for review; it is not written back into any genome yet.`);
    } catch (e: any) {
      showToast('error', 'Synthesis Failed', e.message);
    }
  };

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Header */}
      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Award size={14} color="#d29922" /> Sub-Trajectory Cherry-Picking & Golden Path Synthesis
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Extract breakthrough steps and eliminate dead-ends</span>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflowY: 'auto' }}>
        
        <input 
          type="text" 
          value={goldenLabel} 
          onChange={(e) => setGoldenLabel(e.target.value)}
          placeholder="Golden Path Name..." 
          style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, outline: 'none' }}
        />

        {/* Turns List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {!loading && turns.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No recorded trajectory steps available.</div>}
          {turns.map((turn) => {
            const isBreakthrough = turn.type === 'Breakthrough';
            const isDeadEnd = turn.type === 'Dead-End';
            const isVerification = turn.type === 'Verification';

            let tagColor = 'var(--text-secondary)';
            if (isBreakthrough) tagColor = 'var(--success)';
            if (isDeadEnd) tagColor = 'var(--danger)';
            if (isVerification) tagColor = 'var(--accent-blue)';

            return (
              <div 
                key={turn.id}
                onClick={() => toggleSelect(turn.id)}
                style={{ 
                  background: 'var(--bg-main)', 
                  border: turn.selected ? '1px solid var(--accent-blue)' : '1px solid var(--panel-border)', 
                  borderRadius: '6px', padding: '12px 14px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
                className="hover-bg-gray"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                  <input 
                    type="checkbox" 
                    checked={turn.selected} 
                    onChange={() => {}} 
                    style={{ accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: tagColor, marginBottom: '2px' }}>
                      Step #{turn.stepNum} · {turn.type}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                      {turn.action}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, border: `1px solid ${tagColor}`, color: tagColor }}>
                  {turn.type}
                </div>
              </div>
            );
          })}
        </div>

        <button 
          onClick={handleSynthesize} 
          className="gh-btn gh-btn-primary" 
          style={{ padding: '8px 16px', justifyContent: 'center' }}
        >
          <Sparkles size={14} /> Fuse Selected Steps into Golden Path DNA
        </button>

      </div>

    </div>
  );
};
