import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, FileCheck2, GitBranch, GitMerge, Play, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { api } from '../api/client';

type Candidate = {
  name: string;
  mutation?: string;
  success: boolean;
  tests_passed?: number;
  exit_code: number;
  duration_ms: number;
};

type Evidence = {
  schema_version: number;
  generated_at: string;
  source: { command: string; fixture: string };
  baseline: { reproduced: boolean; snapshot_id?: string };
  candidates: Candidate[];
  selection: { winner: string; replay_verified: boolean; merge_decision: string };
  usage: { model_calls: number; input_tokens: number; output_tokens: number; cost_usd: number; reason?: string };
  runtime: { wall_ms: number; genos_operations: number };
  execution?: { mode: string; live: boolean; model_invoked: boolean; provider: string; os_sandbox: boolean };
  limits: string[];
};

const stages = [
  { label: 'Bug reproduced', icon: Play },
  { label: 'Snapshot captured', icon: ShieldCheck },
  { label: '3 mutations tested', icon: GitBranch },
  { label: 'Winner replayed', icon: RotateCcw },
  { label: 'Merge decision recorded', icon: GitMerge },
];

function isEvidence(value: any): value is Evidence {
  return Boolean(value?.source?.command && value?.source?.fixture && Array.isArray(value.candidates) && value.selection && value.usage && value.runtime && Array.isArray(value.limits));
}

export const SafeDebuggingDemo: React.FC = () => {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  const loadProof = useCallback(async () => {
    const payload = await api.getSafeDebuggingProof() as { available: boolean; running: boolean; evidence: Evidence | null };
    setRunning(payload.running);
    if (!payload.available || !isEvidence(payload.evidence)) throw new Error('No backend proof is available yet. Run the proof to create one.');
    setEvidence(payload.evidence);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadProof()
      .catch((cause: any) => { if (!cancelled) setError(cause?.message || 'Backend proof unavailable.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadProof]);

  const runProof = async () => {
    setRunning(true); setError('');
    try {
      const payload = await api.runSafeDebuggingProof() as { evidence: Evidence };
      if (!isEvidence(payload.evidence)) throw new Error('Backend proof returned an invalid evidence schema.');
      setEvidence(payload.evidence);
    } catch (cause: any) {
      setError(cause?.message || 'Backend proof failed.');
    } finally { setRunning(false); }
  };

  const completed = evidence ? [
    evidence.baseline?.reproduced,
    Boolean(evidence.baseline?.snapshot_id),
    evidence.candidates.length === 3,
    evidence.selection.replay_verified,
    evidence.selection.merge_decision === 'approved',
  ] : [];
  const completedCount = completed.filter(Boolean).length;
  const modelTokens = evidence ? evidence.usage.input_tokens + evidence.usage.output_tokens : null;
  const execution = evidence?.execution;

  return (
    <section className="safe-demo" data-stage={completedCount}>
      <header className="safe-demo__header">
        <div>
          <div className="safe-demo__eyebrow"><span /> BACKEND-EXECUTED PROOF</div>
          <h1>One fixture. Three mutations. One verified replay.</h1>
          <p>This page reads the evidence produced by the GenOS backend. Run proof invokes the scoped fixture on the backend and refreshes the resulting replay evidence.</p>
        </div>
        <div className="safe-demo__command"><span>$</span><code>backend → GenOS CLI fixture</code><button type="button" onClick={runProof} disabled={running}>{running ? 'Running proof…' : 'Run real proof'}</button><small>Requires the backend execution permission; no model is invoked.</small></div>
      </header>

      <div className="safe-demo__disclosure"><AlertTriangle size={16} /><div><strong>BACKEND-CONNECTED FIXTURE</strong><span>This is a real backend execution of the scoped deterministic fixture, not a production run and not a model-quality measurement.</span></div></div>

      {loading && <div className="safe-demo__error">Loading backend proof…</div>}
      {error && <div className="safe-demo__error"><AlertTriangle size={15} /> {error}</div>}

      <div className="safe-demo__pipeline">
        {stages.map((item, index) => {
          const Icon = item.icon;
          const active = Boolean(completed[index]);
          return (
            <React.Fragment key={item.label}>
              <div className={`safe-demo__stage ${active ? 'is-active' : ''}`}><Icon size={18} /><span>{item.label}</span></div>
              {index < stages.length - 1 && <div className={`safe-demo__rail ${active && completed[index + 1] ? 'is-active' : ''}`} />}
            </React.Fragment>
          );
        })}
      </div>

      {evidence && <>
        <div className="safe-demo__worlds">
          <div className="safe-demo__origin"><span className="safe-demo__snapshot">BASELINE SNAPSHOT</span><strong>discount.js</strong><code>amount &gt; 100</code><small>Boundary test fails at $100</small></div>
          <div className="safe-demo__fork-line" aria-hidden="true" />
          <div className="safe-demo__candidates">
            {evidence.candidates.map((candidate) => <article className={`safe-demo__candidate ${candidate.success ? 'is-winner' : 'is-rejected'}`} key={candidate.name}>
              <div className="safe-demo__candidate-head"><span>{candidate.name.replace('candidate-', 'Mutation ').toUpperCase()}</span>{candidate.success ? <Check size={18} /> : <X size={18} />}</div>
              <code>{candidate.mutation || 'Mutation source not included in this artifact'}</code>
              <strong>{candidate.success ? `${candidate.tests_passed ?? '—'} TESTS PASS` : 'REJECTED BY TESTS'}</strong>
              <small>exit {candidate.exit_code} · {candidate.duration_ms.toFixed(0)} ms</small>
              {candidate.success && <div className="safe-demo__winner-label">WINNER REPLAYED</div>}
            </article>)}
          </div>
        </div>

        <div className="safe-demo__proof">
          <div><span>Replay verification</span><strong className={evidence.selection.replay_verified ? 'success' : ''}>{evidence.selection.replay_verified ? '0 FILES CHANGED' : 'FAILED'}</strong></div>
          <div><span>Merge decision</span><strong className={evidence.selection.merge_decision === 'approved' ? 'success' : ''}>{evidence.selection.merge_decision.toUpperCase()}</strong></div>
          <div><span>GenOS operations</span><strong>{evidence.runtime.genos_operations}</strong></div>
          <div><span>Model calls</span><strong>{evidence.usage.model_calls}</strong></div>
          <div><span>Model tokens / cost</span><strong>{modelTokens} / ${evidence.usage.cost_usd.toFixed(2)}</strong></div>
          <div><span>Fixture wall time</span><strong>{(evidence.runtime.wall_ms / 1000).toFixed(2)} s</strong></div>
        </div>

        <div className="safe-demo__metadata"><FileCheck2 size={14} /><span>Backend proof generated {new Date(evidence.generated_at).toLocaleString()}</span><span>Schema v{evidence.schema_version}</span><span>Mode: {execution?.mode || 'deterministic fixture'}</span><span>Provider: {execution?.provider || 'directory'}</span></div>
      </>}

      <footer className="safe-demo__footer"><span>{evidence?.usage.reason || 'No model invocation recorded.'}</span><span>{evidence?.limits.join(' · ') || 'Limits unavailable until the artifact loads.'}</span></footer>
    </section>
  );
};
