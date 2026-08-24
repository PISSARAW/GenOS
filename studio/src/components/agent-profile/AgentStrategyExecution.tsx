import React, { useEffect, useState } from 'react';
import { Activity, AlertOctagon, CheckCircle2, Clock3, Gauge, MinusCircle, PlayCircle } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

interface ExecutionRun {
  id: string;
  status: string;
  contractVersion: number;
  budget: Record<string, number>;
  metrics: Record<string, number>;
  guardrailReason?: string;
  adherence: { planned: number; observed: number; completed: number; percent: number; deviations: any[] };
  steps: Array<{
    id: string;
    sequence: number;
    stageKey: string;
    status: string;
    actualMetrics: Record<string, number>;
    evidence: Array<{ detail?: string }>;
  }>;
}

const TERMINAL_RUN_STATUSES = ['completed', 'failed', 'cancelled'];
const isTerminal = (status?: string) => TERMINAL_RUN_STATUSES.includes(String(status || '').toLowerCase());

const title = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const colors: Record<string, string> = {
  completed: 'var(--success)', running: 'var(--accent-blue)', blocked: 'var(--danger)',
  failed: 'var(--danger)', skipped: 'var(--warning)', awaiting_approval: 'var(--warning)', planned: 'var(--text-muted)'
};

function metricLabel(key: string, value: number) {
  if (key === 'costUsd') return `$${value.toFixed(3)}`;
  if (key === 'latencyMs') return `${(value / 1000).toFixed(1)}s`;
  return Math.round(value).toLocaleString();
}

export const AgentStrategyExecution: React.FC<{ agentId: string }> = ({ agentId }) => {
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [approving, setApproving] = useState(false);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    let active = true;
    setRuns([]);
    setSelectedRunId(null);
    api.getAgentExecutionRuns(agentId).then((items: any) => {
      if (!active) return;
      const list = Array.isArray(items) ? items : [];
      if (list.length > 0) setRuns(list);
      else return Promise.reject(new Error('No execution runs.'));
    }).catch(() => {
      api.getLatestAgentExecutionRun(agentId).then((latest) => {
        if (!active) return;
        if (latest) setRuns([latest]);
        else setUnavailable(true);
      }).catch(() => { if (active) setUnavailable(true); });
    });
    return () => { active = false; };
  }, [agentId]);

  const run = (selectedRunId ? runs.find((item) => item.id === selectedRunId) : null) || runs[0] || null;

  useEffect(() => {
    if (!run || isTerminal(run.status)) return;
    let active = true;
    const timer = window.setInterval(() => {
      api.getLatestAgentExecutionRun(agentId).then((latest) => {
        if (!active || !latest) return;
        setRuns((prev) => prev.some((item) => item.id === latest.id)
          ? prev.map((item) => (item.id === latest.id ? latest : item))
          : [...prev, latest]);
      }).catch(() => {});
    }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [agentId, run?.id, run?.status]);

  const handleApprove = () => {
    if (!run) return;
    setApproving(true);
    api.approveExecutionRun(run.id).then((updated: any) => {
      if (updated) {
        setRuns((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      }
      showToast('success', 'Promotion Approved', `Execution run ${run.id} was approved.`);
    }).catch((err: any) => {
      showToast('error', 'Approval Failed', err.message || 'The execution run could not be approved.');
    }).finally(() => setApproving(false));
  };

  const panel: React.CSSProperties = {
    background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '20px'
  };
  if (!run) {
    return (
      <section style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 600 }}>
          <PlayCircle size={17} color="var(--text-muted)" /> Strategy execution
        </div>
        <p style={{ margin: '9px 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
          {unavailable ? 'No execution run yet. Starting this agent will compile and enforce the active contract.' : 'Loading execution state…'}
        </p>
      </section>
    );
  }

  return (
    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 650 }}>
            <Activity size={17} color="var(--accent-blue)" /> Planned vs actual execution
          </div>
          <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '0.74rem' }}>Contract v{run.contractVersion} · {run.id}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {runs.length > 1 && (
            <select
              value={run.id}
              onChange={(e) => setSelectedRunId(e.target.value)}
              style={{ padding: '4px 8px', border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-main)', color: 'var(--text-secondary)', fontSize: '0.75rem' }}
              title="Select a past execution run"
            >
              {runs.map((item) => (
                <option key={item.id} value={item.id}>
                  v{item.contractVersion} · {item.status} · {item.id.substring(0, 8)}
                </option>
              ))}
            </select>
          )}
          <div style={{ color: colors[run.status] || 'var(--text-primary)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>{run.status}</div>
        </div>
      </div>

      {run.guardrailReason && (
        <div style={{ marginTop: '14px', padding: '10px 12px', display: 'flex', gap: '8px', border: '1px solid var(--danger)', borderRadius: '5px', color: 'var(--danger)', fontSize: '0.8rem' }}>
          <AlertOctagon size={15} /> {run.guardrailReason}
        </div>
      )}

      {run.status === 'awaiting_approval' && (
        <div style={{ marginTop: '14px', padding: '11px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', border: '1px solid var(--warning)', borderRadius: '5px', color: 'var(--warning)', fontSize: '0.8rem' }}>
          <span>Technical execution finished. The contract forbids promotion without human approval.</span>
          <button className="gh-btn" disabled={approving} onClick={handleApprove}>{approving ? 'Approving…' : 'Approve promotion'}</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 1.1fr) repeat(4, minmax(100px, 0.7fr))', gap: '10px', marginTop: '16px' }}>
        <div style={{ padding: '12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '5px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>CONTRACT ADHERENCE</div>
          <div style={{ marginTop: '5px', color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 700 }}>{run.adherence.percent}%</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{run.adherence.completed}/{run.adherence.planned} stages completed</div>
        </div>
        {['tokens', 'costUsd', 'latencyMs', 'events'].map((key) => {
          const used = Number(run.metrics[key] || 0);
          const limit = Number(run.budget[key] || 0);
          const percent = limit ? Math.min(100, (used / limit) * 100) : 0;
          return (
            <div key={key} style={{ padding: '12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '0.68rem' }}><Gauge size={12} /> {title(key)}</div>
              <div style={{ marginTop: '5px', color: percent > 85 ? 'var(--danger)' : 'var(--text-primary)', fontWeight: 650, fontSize: '0.82rem' }}>{metricLabel(key, used)} / {metricLabel(key, limit)}</div>
              <div style={{ height: '3px', marginTop: '8px', background: 'var(--panel-border)', borderRadius: '3px' }}><div style={{ width: `${percent}%`, height: '100%', background: percent > 85 ? 'var(--danger)' : 'var(--accent-blue)' }} /></div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '16px', display: 'grid', gap: '6px' }}>
        {run.steps.map((step) => {
          const Icon = step.status === 'completed' ? CheckCircle2 : step.status === 'running' ? Clock3 : MinusCircle;
          const evidence = step.evidence.at(-1)?.detail;
          return (
            <div key={step.id} style={{ display: 'grid', gridTemplateColumns: '24px minmax(170px, 1fr) 100px minmax(180px, 2fr)', alignItems: 'center', gap: '10px', padding: '9px 10px', border: '1px solid var(--panel-border)', borderRadius: '5px', background: 'var(--bg-main)', fontSize: '0.76rem' }}>
              <Icon size={15} color={colors[step.status] || 'var(--text-muted)'} />
              <strong style={{ color: 'var(--text-primary)' }}>{step.sequence + 1}. {title(step.stageKey)}</strong>
              <span style={{ color: colors[step.status] || 'var(--text-muted)', fontWeight: 600 }}>{step.status}</span>
              <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evidence || 'No runtime evidence observed'}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};
