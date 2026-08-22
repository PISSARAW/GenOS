import React, { useEffect, useState } from 'react';
import { Check, GitBranch, GitMerge, Play, RotateCcw, ShieldCheck, X } from 'lucide-react';

type Candidate = {
  name: string;
  success: boolean;
  exit_code: number;
  duration_ms: number;
};

type Evidence = {
  generated_at: string;
  candidates: Candidate[];
  selection: {
    winner: string;
    replay_verified: boolean;
    merge_decision: string;
  };
  usage: {
    model_calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  runtime: {
    wall_ms: number;
    genos_operations: number;
  };
  limits: string[];
};

const stages = [
  { label: 'Bug reproduced', icon: Play },
  { label: 'Snapshot captured', icon: ShieldCheck },
  { label: '3 futures tested', icon: GitBranch },
  { label: 'Winner replayed', icon: RotateCcw },
  { label: 'Merge approved', icon: GitMerge },
];

export const SafeDebuggingDemo: React.FC = () => {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    fetch('/demo/safe-debugging.json')
      .then((response) => {
        if (!response.ok) throw new Error('Demo evidence unavailable');
        return response.json();
      })
      .then(setEvidence)
      .catch(() => setEvidence(null));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setStage((current) => (current + 1) % stages.length), 1250);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="safe-demo" data-stage={stage}>
      <header className="safe-demo__header">
        <div>
          <div className="safe-demo__eyebrow"><span /> REPRODUCIBLE PRODUCT PROOF</div>
          <h1>One bug. Three futures. One verified fix.</h1>
          <p>GenOS snapshots the broken state, tests competing fixes in isolation, then replays and promotes only the winner.</p>
        </div>
        <div className="safe-demo__command">
          <span>$</span> ./examples/safe-debugging-demo/run-demo.sh
        </div>
      </header>

      <div className="safe-demo__pipeline">
        {stages.map((item, index) => {
          const Icon = item.icon;
          const active = index <= stage;
          return (
            <React.Fragment key={item.label}>
              <div className={`safe-demo__stage ${active ? 'is-active' : ''}`}>
                <Icon size={18} />
                <span>{item.label}</span>
              </div>
              {index < stages.length - 1 && <div className={`safe-demo__rail ${index < stage ? 'is-active' : ''}`} />}
            </React.Fragment>
          );
        })}
      </div>

      <div className="safe-demo__worlds">
        <div className="safe-demo__origin">
          <span className="safe-demo__snapshot">SNAPSHOT 01</span>
          <strong>discount.js</strong>
          <code>amount &gt; 100</code>
          <small>Boundary test fails at $100</small>
        </div>
        <div className="safe-demo__fork-line" aria-hidden="true" />
        <div className="safe-demo__candidates">
          {(evidence?.candidates ?? []).map((candidate) => (
            <article className={`safe-demo__candidate ${candidate.success ? 'is-winner' : 'is-rejected'}`} key={candidate.name}>
              <div className="safe-demo__candidate-head">
                <span>{candidate.name.replace('candidate-', 'Future ').toUpperCase()}</span>
                {candidate.success ? <Check size={18} /> : <X size={18} />}
              </div>
              <code>{candidate.name === 'candidate-a' ? 'amount >= 100' : candidate.name === 'candidate-b' ? 'amount > 99' : 'amount >= 90'}</code>
              <strong>{candidate.success ? '5 / 5 TESTS PASS' : 'REJECTED BY GATE'}</strong>
              <small>exit {candidate.exit_code} · {candidate.duration_ms.toFixed(0)} ms</small>
              {candidate.success && <div className="safe-demo__winner-label">SELECTED FOR REPLAY</div>}
            </article>
          ))}
        </div>
      </div>

      <div className="safe-demo__proof">
        <div><span>Replay</span><strong className="success">{evidence?.selection.replay_verified ? 'BYTE-IDENTICAL' : 'LOADING'}</strong></div>
        <div><span>Merge gate</span><strong className="success">{evidence?.selection.merge_decision?.toUpperCase() ?? 'LOADING'}</strong></div>
        <div><span>GenOS operations</span><strong>{evidence?.runtime.genos_operations ?? '—'}</strong></div>
        <div><span>Measured tokens</span><strong>{(evidence?.usage.input_tokens ?? 0) + (evidence?.usage.output_tokens ?? 0)}</strong></div>
        <div><span>Measured cost</span><strong>${(evidence?.usage.cost_usd ?? 0).toFixed(2)}</strong></div>
        <div><span>Wall time</span><strong>{evidence ? `${(evidence.runtime.wall_ms / 1000).toFixed(2)} s` : '—'}</strong></div>
      </div>

      <footer className="safe-demo__footer">
        <span>Evidence generated {evidence ? new Date(evidence.generated_at).toLocaleString() : 'locally'}</span>
        <span>Deterministic fixture · no language model invoked · directory-level isolation</span>
      </footer>
    </section>
  );
};
