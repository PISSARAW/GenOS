import React, { useState } from 'react';
import { Award, Check, Sparkles, AlertCircle, HelpCircle } from 'lucide-react';
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
  const [turns, setTurns] = useState<TrajectoryTurn[]>([
    { id: 't1', stepNum: 1, type: 'Exploration', action: 'Scan codebase files with find_by_name to locate middleware', selected: false },
    { id: 't2', stepNum: 2, type: 'Breakthrough', action: 'Isolate timing vulnerability in token equality verification', selected: true },
    { id: 't3', stepNum: 3, type: 'Dead-End', action: 'Attempted to rewrite entire auth module with external package (Failed)', selected: false },
    { id: 't4', stepNum: 4, type: 'Breakthrough', action: 'Apply surgical replace_file_content using crypto.timingSafeEqual', selected: true },
    { id: 't5', stepNum: 5, type: 'Verification', action: 'Execute test suite (58/58 passed) with 0 regressions', selected: true },
  ]);
  const [goldenLabel, setGoldenLabel] = useState('Golden Path: Constant-Time Token Hardening');
  const showToast = useToastStore((state) => state.showToast);

  const toggleSelect = (id: string) => {
    setTurns((prev) => prev.map((t) => t.id === id ? { ...t, selected: !t.selected } : t));
  };

  const handleSynthesize = async () => {
    const selectedIds = turns.filter((t) => t.selected).map((t) => `Step #${t.stepNum}: ${t.action}`);
    try {
      await api.cherryPickGoldenPath({
        trajectoryIds: selectedIds,
        label: goldenLabel
      });
      showToast('success', 'Golden Path Synthesized', `Fused ${selectedIds.length} breakthrough steps into global DNA.`);
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
