import React, { useEffect, useMemo, useState } from 'react';
import { Award, ChevronDown, ChevronRight, Copy, Sparkles } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

interface TrajectoryTurn {
  id: string;
  trajectoryId: string;
  trajectoryTitle: string;
  stepNum: number;
  type: 'Exploration' | 'Breakthrough' | 'Dead-End' | 'Verification';
  action: string;
  selected: boolean;
}

interface TrajectoryGroup {
  id: string;
  title: string;
  turns: TrajectoryTurn[];
}

interface SynthesisResult {
  synthesisId: string;
  stepCount: number;
}

export const GoldenPathCherryPicker: React.FC = () => {
  const [turns, setTurns] = useState<TrajectoryTurn[]>([]);
  const [goldenLabel, setGoldenLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [synthesis, setSynthesis] = useState<SynthesisResult | null>(null);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    api.getTrajectories()
      .then((data: any) => {
        const trajectories = [...(data?.pendingList || []), ...(data?.activeList || [])];
        const loadedTurns = trajectories.flatMap((trajectory: any) => {
          const lines = Array.isArray(trajectory.diffLines) ? trajectory.diffLines : [];
          return lines.map((line: any, index: number) => ({
            id: `${trajectory.id}:${index}`,
            trajectoryId: String(trajectory.id),
            trajectoryTitle: String(trajectory.title || trajectory.id),
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

  const groups = useMemo<TrajectoryGroup[]>(() => {
    const map = new Map<string, TrajectoryGroup>();
    for (const turn of turns) {
      let group = map.get(turn.trajectoryId);
      if (!group) {
        group = { id: turn.trajectoryId, title: turn.trajectoryTitle, turns: [] };
        map.set(turn.trajectoryId, group);
      }
      group.turns.push(turn);
    }
    return [...map.values()];
  }, [turns]);

  const selectedCount = turns.filter((t) => t.selected).length;

  const toggleSelect = (id: string) => {
    setTurns((prev) => prev.map((t) => t.id === id ? { ...t, selected: !t.selected } : t));
  };

  const toggleGroup = (groupId: string, selectAll: boolean) => {
    setTurns((prev) => prev.map((t) => t.trajectoryId === groupId ? { ...t, selected: selectAll } : t));
  };

  const handleSynthesize = async () => {
    const selectedTurns = turns.filter((t) => t.selected);
    if (!goldenLabel.trim() || selectedTurns.length === 0 || isSynthesizing) return;
    setIsSynthesizing(true);
    try {
      const res = await api.cherryPickGoldenPath({
        turns: selectedTurns,
        label: goldenLabel.trim()
      });
      setSynthesis({
        synthesisId: String(res?.synthesisId || 'unknown'),
        stepCount: Number(res?.prunedStepCount ?? selectedTurns.length)
      });
      showToast('success', 'Golden Path Synthesized', `Classified ${selectedTurns.length} selected steps into synthesis ${res?.synthesisId || ''}.`);
    } catch (e: any) {
      showToast('error', 'Synthesis Failed', e.message);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const copySynthesisId = async () => {
    if (!synthesis) return;
    try {
      await navigator.clipboard.writeText(synthesis.synthesisId);
      showToast('success', 'Synthesis ID Copied', `${synthesis.synthesisId} was copied to the clipboard.`);
    } catch {
      showToast('error', 'Copy Failed', 'The synthesis ID could not be copied.');
    }
  };

  const canSynthesize = Boolean(goldenLabel.trim()) && selectedCount > 0 && !isSynthesizing;

  const renderTurnRow = (turn: TrajectoryTurn) => {
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
            onChange={() => toggleSelect(turn.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select step ${turn.stepNum}: ${turn.action.slice(0, 60)}`}
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

        {/* Trajectory Groups */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {!loading && groups.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No recorded trajectory steps available.</div>}
          {groups.map((group) => {
            const groupSelected = group.turns.filter((t) => t.selected).length;
            const allSelected = groupSelected === group.turns.length;
            const isCollapsed = Boolean(collapsed[group.id]);

            return (
              <div key={group.id} style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
                <div 
                  onClick={() => setCollapsed((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                  style={{ background: 'var(--bg-subtle)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                  className="hover-bg-gray"
                >
                  <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </span>
                  <input 
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => toggleGroup(group.id, !allSelected)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select all steps in ${group.title}`}
                    style={{ accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
                  />
                  <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {group.title}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {groupSelected}/{group.turns.length} selected
                  </span>
                </div>
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px' }}>
                    {group.turns.map(renderTurnRow)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button 
          onClick={handleSynthesize} 
          disabled={!canSynthesize}
          className="gh-btn gh-btn-primary" 
          style={{ padding: '8px 16px', justifyContent: 'center', opacity: canSynthesize ? 1 : 0.5, cursor: canSynthesize ? 'pointer' : 'not-allowed' }}
        >
          <Sparkles size={14} /> {isSynthesizing ? 'Synthesizing...' : 'Fuse Selected Steps into Golden Path DNA'}
        </button>

        {synthesis && (
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--success)', borderRadius: '6px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--success)' }}>
              Synthesis Ready
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                Synthesis ID: <span style={{ fontFamily: 'monospace', color: 'var(--accent-blue)' }}>{synthesis.synthesisId}</span> · {synthesis.stepCount} step{synthesis.stepCount === 1 ? '' : 's'} fused
              </div>
              <button onClick={copySynthesisId} className="gh-btn" style={{ fontSize: '0.7rem', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <Copy size={10} /> Copy ID
              </button>
            </div>
            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              The synthesis is held in memory for review only; it is not written back into any genome yet. Promote it explicitly before it influences future agents.
            </p>
          </div>
        )}

      </div>

    </div>
  );
};
