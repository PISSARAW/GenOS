import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleStop,
  GitBranch, GitMerge, History, Layers3, LockKeyhole, Route, Scale, ShieldCheck
} from 'lucide-react';
import { api } from '../../api/client';
import { AgentStrategyExecution } from './AgentStrategyExecution';

interface StrategyContractRecord {
  id: string;
  version: number;
  status: string;
  primaryStrategy: string;
  contractHash: string;
  decisionReason?: string;
  createdBy: string;
  createdAt: string;
  contract: any;
}

interface AgentStrategyContractProps {
  agentId: string;
}

const label = (value?: string) => String(value || 'not specified')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const panel: React.CSSProperties = {
  background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px'
};

const chip = (color = 'var(--text-secondary)'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px',
  borderRadius: '12px', border: '1px solid var(--panel-border)', background: 'var(--bg-main)',
  color, fontSize: '0.72rem', fontWeight: 600
});

export const AgentStrategyContract: React.FC<AgentStrategyContractProps> = ({ agentId }) => {
  const [record, setRecord] = useState<StrategyContractRecord | null>(null);
  const [history, setHistory] = useState<StrategyContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [showDecisions, setShowDecisions] = useState(false);
  const [decisionFilter, setDecisionFilter] = useState('selected');

  useEffect(() => {
    let active = true;
    Promise.all([
      api.getAgentStrategyContract(agentId),
      api.getAgentStrategyContractHistory(agentId)
    ]).then(([latest, versions]) => {
      if (!active) return;
      setRecord(latest);
      setHistory(Array.isArray(versions) ? versions : []);
    }).catch((reason) => {
      if (active) setError(reason.message || 'Strategy contract unavailable.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [agentId]);

  if (loading) return <div style={{ ...panel, padding: '24px', color: 'var(--text-secondary)' }}>Loading the orchestrator contract…</div>;
  if (error || !record) {
    return (
      <div style={{ ...panel, padding: '24px', color: 'var(--text-secondary)' }}>
        <AlertTriangle size={18} color="var(--warning)" style={{ verticalAlign: 'middle', marginRight: '8px' }} />
        {error || 'No strategy contract has been selected.'}
      </div>
    );
  }

  const contract = record.contract;
  const profile = contract.problem_profile || {};
  const strategy = contract.selected_strategy || {};
  const promotion = contract.promotion || {};
  const summary = contract.strategy_decision_summary || {};
  const portfolio = contract.strategy_portfolio || [];
  const decisions = (contract.strategy_decisions || []).filter((decision: any) => decisionFilter === 'all' || decision.status === decisionFilter);

  return (
    <>
      <section style={{ ...panel, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 600 }}>
              <Route size={18} color="var(--accent-purple)" /> Orchestrator Strategy Contract
            </div>
            <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.83rem', lineHeight: 1.5 }}>
              Immutable decision record governing how this mission is explored, evaluated and promoted.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={chip('var(--success)')}><CheckCircle2 size={12} /> {record.status}</span>
            <span style={chip()}>v{record.version}</span>
            <span style={chip(strategy.maturity === 'implemented' ? 'var(--success)' : 'var(--warning)')}>{strategy.maturity}</span>
          </div>
        </div>

        <div style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em' }}>Primary strategy</div>
          <div style={{ marginTop: '6px', fontSize: '1.35rem', fontWeight: 650, color: 'var(--text-primary)' }}>{label(strategy.primary)}</div>
          <p style={{ margin: '8px 0 16px', color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.55 }}>{strategy.rationale || record.decisionReason}</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={chip()}>{label(profile.type)}</span>
            <span style={chip(profile.risk === 'high' ? 'var(--danger)' : 'var(--warning)')}>Risk: {profile.risk}</span>
            <span style={chip()}>Uncertainty: {Math.round(Number(profile.uncertainty || 0) * 100)}%</span>
            <span style={chip()}>Evaluation: {label(profile.evaluability)}</span>
            <span style={chip('var(--accent-purple)')}>{summary.total_registry || 1} strategies evaluated</span>
          </div>
        </div>
      </section>

      <AgentStrategyExecution agentId={agentId} />

      {portfolio.length > 0 && (
        <section style={{ ...panel, padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers3 size={16} color="var(--accent-purple)" /> Composed strategy portfolio
            </h3>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span style={chip('var(--success)')}>{summary.selected || portfolio.length} selected</span>
              <span style={chip()}>{summary.eligible_not_selected || 0} alternatives</span>
              <span style={chip('var(--text-muted)')}>{summary.ineligible || 0} rejected</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px' }}>
            {portfolio.map((item: any, index: number) => (
              <div key={item.id} style={{ padding: '13px', border: index === 0 ? '1px solid var(--accent-purple)' : '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-main)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ color: index === 0 ? 'var(--accent-purple)' : 'var(--text-primary)', fontWeight: 650, fontSize: '0.84rem' }}>{item.name || label(item.id)}</div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{item.score == null ? 'gate' : item.score.toFixed(1)}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <span style={chip()}>{item.family}</span><span style={chip(item.maturity === 'implemented' ? 'var(--success)' : 'var(--warning)')}>{item.maturity}</span>
                </div>
                <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.45 }}>{(item.primitives || []).map(label).join(' → ')}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ ...panel, padding: '20px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitBranch size={16} color="var(--text-muted)" /> Execution pipeline
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '7px' }}>
          {(contract.execution_pipeline || []).map((stage: string, index: number) => (
            <React.Fragment key={stage}>
              <span style={{ ...chip(index === 0 ? 'var(--accent-blue)' : 'var(--text-primary)'), borderRadius: '5px', padding: '6px 9px' }}>{index + 1}. {label(stage)}</span>
              {index < contract.execution_pipeline.length - 1 && <ChevronRight size={14} color="var(--text-muted)" />}
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginTop: '18px' }}>
          {[
            ['Allocation', strategy.allocation, Scale],
            ['Evaluation', strategy.evaluation, ShieldCheck],
            ['Merge policy', strategy.merge, GitMerge]
          ].map(([title, value, Icon]: any) => (
            <div key={title} style={{ padding: '14px', border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-main)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}><Icon size={14} /> {title}</div>
              <div style={{ marginTop: '7px', color: 'var(--text-primary)', fontSize: '0.84rem', fontWeight: 600 }}>{label(value)}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...panel, padding: '20px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', color: 'var(--text-primary)' }}>Isolated strategy branches</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
          {(contract.branches || []).map((branch: any, index: number) => (
            <div key={branch.label || index} style={{ padding: '14px', border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-main)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <strong style={{ color: 'var(--accent-blue)', fontSize: '0.8rem' }}>{branch.label}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{Math.round(Number(branch.budget_share || 0) * 100)}% budget</span>
              </div>
              <div style={{ marginTop: '8px', color: 'var(--text-primary)', fontSize: '0.87rem', fontWeight: 600 }}>{label(branch.hypothesis)}</div>
              <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '0.72rem' }}>{label(branch.isolation)}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        <section style={{ ...panel, padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}><CircleStop size={16} color="var(--danger)" /> Stop conditions</h3>
          {(contract.stop_conditions || []).map((condition: string) => (
            <div key={condition} style={{ display: 'flex', gap: '8px', marginTop: '9px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}><ChevronRight size={13} /> {label(condition)}</div>
          ))}
        </section>
        <section style={{ ...panel, padding: '20px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}><LockKeyhole size={16} color="var(--warning)" /> Promotion gates</h3>
          {Object.entries(promotion).map(([gate, enabled]) => (
            <div key={gate} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '9px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
              <span>{label(gate)}</span><strong style={{ color: enabled ? 'var(--success)' : 'var(--text-muted)' }}>{enabled ? 'YES' : 'NO'}</strong>
            </div>
          ))}
        </section>
      </div>

      <section style={{ ...panel, overflow: 'hidden' }}>
        {contract.strategy_decisions?.length > 0 && (
          <>
            <button onClick={() => setShowDecisions(!showDecisions)} style={{ width: '100%', padding: '14px 16px', border: 'none', borderBottom: showDecisions ? '1px solid var(--panel-border)' : 'none', background: 'var(--bg-subtle)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}><Scale size={15} /> 77-strategy decision ledger</span>
              {showDecisions ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            {showDecisions && (
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  {['selected', 'eligible_not_selected', 'ineligible', 'all'].map((status) => (
                    <button key={status} onClick={() => setDecisionFilter(status)} className="gh-btn" style={{ fontSize: '0.72rem', color: decisionFilter === status ? 'var(--accent-blue)' : 'var(--text-secondary)', borderColor: decisionFilter === status ? 'var(--accent-blue)' : 'var(--panel-border)' }}>{label(status)}</button>
                  ))}
                </div>
                <div style={{ maxHeight: '430px', overflow: 'auto', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
                  {decisions.map((decision: any, index: number) => (
                    <div key={decision.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 1.5fr) 110px 105px 70px minmax(220px, 2fr)', gap: '10px', padding: '10px 12px', borderBottom: index < decisions.length - 1 ? '1px solid var(--panel-border)' : 'none', background: decision.status === 'selected' ? 'rgba(188, 140, 255, 0.06)' : 'var(--bg-main)', alignItems: 'center', fontSize: '0.76rem' }}>
                      <strong style={{ color: decision.status === 'selected' ? 'var(--accent-purple)' : 'var(--text-primary)' }}>{decision.name}</strong>
                      <span style={{ color: 'var(--text-secondary)' }}>{decision.family}</span>
                      <span style={{ color: decision.maturity === 'implemented' ? 'var(--success)' : 'var(--warning)' }}>{decision.maturity}</span>
                      <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{decision.score == null ? '—' : decision.score.toFixed(1)}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{decision.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <button onClick={() => setShowRaw(!showRaw)} style={{ width: '100%', padding: '14px 16px', border: 'none', background: 'var(--bg-subtle)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}><History size={15} /> Audit & raw contract</span>
          {showRaw ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {showRaw && (
          <div style={{ padding: '16px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: 1.6 }}>
              <div>Selected by: <strong style={{ color: 'var(--text-primary)' }}>{record.createdBy}</strong></div>
              <div>Selected at: <strong style={{ color: 'var(--text-primary)' }}>{new Date(record.createdAt).toLocaleString()}</strong></div>
              <div style={{ overflowWrap: 'anywhere' }}>Integrity: <code>{record.contractHash}</code></div>
              <div>Versions preserved: <strong style={{ color: 'var(--text-primary)' }}>{history.length}</strong></div>
            </div>
            <pre style={{ margin: '14px 0 0', padding: '14px', maxHeight: '420px', overflow: 'auto', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.76rem', lineHeight: 1.5 }}>{JSON.stringify(contract, null, 2)}</pre>
          </div>
        )}
      </section>
    </>
  );
};
