import React, { useState } from 'react';
import { Trophy, Play, Shuffle, GitCommit, Check } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

interface SolverRating {
  id: string;
  name: string;
  archetype: string;
  elo: number;
  winRate: number;
  matches: number;
  status: 'idle' | 'competing' | 'champion';
}

export const SolverTournament: React.FC = () => {
  const [solvers, setSolvers] = useState<SolverRating[]>([]);
  const [benchmarkSuite, setBenchmarkSuite] = useState('Local Sorted Search');
  const [isRunning, setIsRunning] = useState(false);
  const [genePayload, setGenePayload] = useState('AST Invariant: check strict type assertions before mutation');
  const showToast = useToastStore((state) => state.showToast);

  const applyLeaderboard = (leaderboard: any[]) => setSolvers(leaderboard.map((s: any) => ({
    id: s.solverKey,
    name: s.solverName,
    archetype: s.archetype,
    elo: s.eloRating,
    winRate: s.adversarialPassRate,
    matches: s.roundsCompleted,
    status: 'idle'
  })));

  React.useEffect(() => {
    api.getSolverTournament().then((result: any) => applyLeaderboard(result?.leaderboard || [])).catch((e: any) => console.warn('[Studio] tournament load failed:', e));
  }, []);

  const handleRunMatch = async () => {
    setIsRunning(true);
    try {
      const result: any = await api.runSolverTournament({
        benchmarkId: benchmarkSuite,
        solvers: solvers.map((s) => s.id),
        rounds: 3
      });
      const leaderboard = Array.isArray(result?.leaderboard) ? result.leaderboard : [];
      setSolvers(leaderboard.map((s: any) => ({
        id: s.solverKey,
        name: s.solverName,
        archetype: s.archetype,
        elo: s.eloRating,
        winRate: s.adversarialPassRate,
        matches: s.roundsCompleted,
        status: 'idle'
      })));
      showToast('success', 'Tournament Match Concluded', `Benchmark "${benchmarkSuite}" evaluated. Elo updated.`);
    } catch (e: any) {
      showToast('error', 'Tournament Error', e.message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCrossPollinate = async () => {
    if (solvers.length < 2) return;
    try {
      await api.crossPollinateHeuristics({
        sourceSolver: solvers[0].name,
        targetSolver: solvers[1].name,
        gene: genePayload
      });
      showToast('success', 'Heuristic Recorded', `Recorded a genome decision for review between ${solvers[0].name} and ${solvers[1].name}.`);
    } catch (e: any) {
      showToast('error', 'Cross-Pollination Failed', e.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      
      {/* Controls Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Trophy size={18} color="#d29922" />
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Solver ELO Rating & Tournament Grid</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Execute search strategies against a local benchmark</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select 
            value={benchmarkSuite} 
            onChange={(e) => setBenchmarkSuite(e.target.value)}
            style={{ padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
          >
            <option value="Local Sorted Search">Local Sorted Search</option>
          </select>
          <button 
            onClick={handleRunMatch} 
            disabled={isRunning}
            className="gh-btn gh-btn-primary" 
            style={{ fontSize: '0.75rem', padding: '4px 12px' }}
          >
            <Play size={12} /> {isRunning ? 'Running...' : 'Run Benchmark'}
          </button>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '10px 16px' }}>Rank</th>
              <th style={{ padding: '10px 16px' }}>Solver Name</th>
              <th style={{ padding: '10px 16px' }}>Archetype</th>
              <th style={{ padding: '10px 16px' }}>ELO Rating</th>
              <th style={{ padding: '10px 16px' }}>Win Rate</th>
              <th style={{ padding: '10px 16px' }}>Matches</th>
              <th style={{ padding: '10px 16px', textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {solvers.map((s, idx) => (
              <tr key={s.id} style={{ borderBottom: idx < solvers.length - 1 ? '1px solid var(--panel-border)' : 'none' }} className="hover-bg-gray">
                <td style={{ padding: '10px 16px', fontWeight: 600, color: idx === 0 ? '#d29922' : 'var(--text-secondary)' }}>
                  #{idx + 1}
                </td>
                <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--accent-blue)' }}>
                  {s.name}
                </td>
                <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{s.archetype}</td>
                <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>{s.elo}</td>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '60px', height: '6px', background: 'var(--bg-main)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${s.winRate}%`, height: '100%', background: s.winRate > 70 ? 'var(--success)' : 'var(--accent-blue)' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.winRate}%</span>
                  </div>
                </td>
                <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{s.matches}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                  {idx === 0 ? (
                    <span style={{ border: '1px solid #d29922', color: '#d29922', background: 'rgba(210, 153, 34, 0.1)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>
                      Champion
                    </span>
                  ) : (
                    <span style={{ border: '1px solid var(--panel-border)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem' }}>
                      Contender
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Heuristic Cross-Pollination Card */}
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Shuffle size={14} color="var(--accent-purple)" /> Heuristic Cross-Pollination Blackboard
          </h4>
          <button onClick={handleCrossPollinate} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 10px', color: 'var(--accent-purple)' }}>
            <GitCommit size={12} /> Record Heuristic Note
          </button>
        </div>
        <input 
          type="text" 
          value={genePayload} 
          onChange={(e) => setGenePayload(e.target.value)} 
          style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }} 
        />
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Check size={12} color="var(--success)" /> Records the submitted heuristic as a genome decision; it is not automatically injected into another solver.
        </div>
      </div>

    </div>
  );
};
