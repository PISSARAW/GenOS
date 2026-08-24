import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Bell, Copy, GitBranch, Network, Play, RotateCcw, Scissors, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

type Tab = 'mcts' | 'safety' | 'provenance' | 'swarm' | 'compare' | 'notifications';

const BENCH_HISTORY_LIMIT = 5;
const TREE_CHILDREN_PREVIEW = 3;

export const EvaluationLineageConsole: React.FC = () => {
  const [tab, setTab] = useState<Tab>('mcts');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bench, setBench] = useState<any>(null);
  const [benchHistory, setBenchHistory] = useState<any[]>([]);
  const [threshold, setThreshold] = useState(0.65);
  const [notifPrefs, setNotifPrefs] = useState<any[]>([]);
  const [serverNotifs, setServerNotifs] = useState<any[]>([]);
  const [prefsDirty, setPrefsDirty] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [lastSuccess, setLastSuccess] = useState<number | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const prefsDirtyRef = useRef(false);
  const showToast = useToastStore((s) => s.showToast);

  const load = () => api.getEvaluationOverview().then((d: any) => {
    setData(d);
    setServerNotifs(d?.notifications || []);
    if (!prefsDirtyRef.current) setNotifPrefs(d?.notifications || []);
    setLastSuccess(Date.now());
    setPollFailed(false);
  }).catch((e: any) => { setPollFailed(true); showToast('error', 'Evaluation backend', e.message); }).finally(() => setLoading(false));
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 8000);
    return () => window.clearInterval(timer);
  }, []);

  const nodes = data?.mcts?.nodes || [];
  const edges = data?.mcts?.edges || [];
  const childrenMap = useMemo(() => {
    const map = new Map<string | null, any[]>();
    for (const n of nodes) {
      const parent = edges.find((e: any) => e.target === n.id)?.source ?? null;
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(n);
    }
    return map;
  }, [nodes, edges]);
  const rootNodeCount = (childrenMap.get(null) || []).length;

  const toggleParent = (id: string) => setExpandedParents((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const renderNode = (node: any, depth: number): React.ReactNode => {
    const children = childrenMap.get(node.id) || [];
    const expanded = expandedParents.has(node.id);
    const visible = expanded ? children : children.slice(0, TREE_CHILDREN_PREVIEW);
    return (
      <div key={node.id}>
        <div style={{ ...card, marginLeft: depth * 18, borderLeft: depth ? '2px solid var(--panel-border)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>{node.label}</strong>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {node.node_type && <small style={{ color: 'var(--text-secondary)' }}>{node.node_type}</small>}
              {node.pruned && <span style={{ color: 'var(--danger)' }}>pruned</span>}
            </span>
          </div>
          <small>score {Number(node.score).toFixed(3)} · {node.visits} visits</small>
          <div style={{ height: 5, background: 'var(--bg-main)', margin: '10px 0' }}>
            <div style={{ width: `${Math.max(3, Math.min(100, node.score * 100))}%`, height: '100%', background: node.pruned ? 'var(--text-muted)' : 'var(--accent-blue)' }} />
          </div>
          {!node.pruned && <button className="gh-btn" onClick={() => prune(node.id)}><Scissors size={12} /> Prune</button>}
        </div>
        {visible.map((child: any) => renderNode(child, depth + 1))}
        {children.length > visible.length && (
          <button className="gh-btn" style={{ marginLeft: (depth + 1) * 18, marginBottom: 8 }} onClick={() => toggleParent(node.id)}>
            +{children.length - visible.length} more
          </button>
        )}
        {expanded && children.length > TREE_CHILDREN_PREVIEW && (
          <button className="gh-btn" style={{ marginLeft: (depth + 1) * 18, marginBottom: 8 }} onClick={() => toggleParent(node.id)}>Show less</button>
        )}
      </div>
    );
  };

  const runBench = async () => {
    try {
      const result = await api.runImpossibleBench({ abstentionThreshold: threshold });
      setBench(result);
      setBenchHistory((h) => [result, ...h].slice(0, BENCH_HISTORY_LIMIT));
      load();
    } catch (e: any) { showToast('error', 'ImpossibleBench', e.message); }
  };
  const prune = async (id: string) => { try { await api.pruneMctsNode(id); showToast('success', 'Branch pruned', 'The MCTS lineage remains auditable through provenance.'); load(); } catch (e: any) { showToast('error', 'Prune failed', e.message); } };

  const setPrefEnabled = (eventType: string, enabled: boolean) => {
    prefsDirtyRef.current = true;
    setPrefsDirty(true);
    setNotifPrefs((prev) => prev.map((n) => n.event_type === eventType ? { ...n, enabled } : n));
  };
  const revertPrefs = () => {
    prefsDirtyRef.current = false;
    setPrefsDirty(false);
    setNotifPrefs(serverNotifs);
  };
  const updateNotifications = async () => {
    try {
      await api.updateNotificationPreferences(notifPrefs.map((n: any) => ({ event_type: n.event_type, enabled: Boolean(n.enabled), channels: n.channels || ['studio'] })));
      prefsDirtyRef.current = false;
      setPrefsDirty(false);
      setServerNotifs(notifPrefs);
      showToast('success', 'Notifications saved', 'Error, drift, budget, blocking and escalation rules persisted.');
    } catch (e: any) { showToast('error', 'Notifications', e.message); }
  };

  const copyHash = async (value: string) => {
    try { await navigator.clipboard.writeText(value); showToast('success', 'Hash copied', 'SHA-256 payload hash copied to clipboard.'); }
    catch (e: any) { showToast('error', 'Copy failed', e.message); }
  };

  const degraded = pollFailed && !!data;
  const statusLabel = loading && !data ? 'Syncing…' : degraded ? 'Stale data — poll failed' : lastSuccess ? 'Backend connected' : 'Syncing…';
  const statusColor = degraded ? 'var(--warning)' : data ? 'var(--success)' : 'var(--warning)';
  const benchAbstained = bench?.results?.filter((r: any) => r.abstained).length ?? 0;

  const tabs: Array<[Tab, string, React.ReactNode]> = [['mcts', 'MCTS / trajectories', <GitBranch size={14} />], ['safety', 'Abstention / ImpossibleBench', <ShieldCheck size={14} />], ['provenance', 'Cryptographic provenance', <Activity size={14} />], ['swarm', 'Stigmergy / quorum', <Network size={14} />], ['compare', 'Versions & skills', <GitBranch size={14} />], ['notifications', 'Notifications', <Bell size={14} />]];
  return <div style={{ height: '100%', overflowY: 'auto', padding: '24px 32px', background: 'var(--bg-main)', color: 'var(--text-primary)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 18 }}><div><h1 style={{ margin: 0, fontSize: '1.25rem' }}>Evaluation, Lineage & Swarm</h1><p style={{ color: 'var(--text-secondary)', margin: '6px 0' }}>Real-time backend observability · scores, decisions, proofs and guardrails.</p></div><span style={{ display: 'flex', alignItems: 'center', gap: 6, color: statusColor, fontSize: '.75rem' }}>{degraded && <AlertTriangle size={13} />}{statusLabel}</span></div>
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>{tabs.map(([id, label, icon]) => <button key={id} className="gh-btn" onClick={() => setTab(id)} style={{ background: tab === id ? 'var(--bg-subtle)' : undefined, color: tab === id ? 'var(--text-primary)' : undefined, display: 'flex', gap: 6, alignItems: 'center' }}>{icon}{label}</button>)}</div>
    {tab === 'mcts' && <section style={panel}><h3>Hypothesis tree · MCTS controls</h3>{rootNodeCount > 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '.78rem' }}>Roots: {rootNodeCount} · nodes: {nodes.length} · edges: {edges.length}. Children are grouped by lineage edge.</p>}<div>{(() => {
      const roots = childrenMap.get(null) || [];
      const rootsKey = '__roots__';
      const rootsExpanded = expandedParents.has(rootsKey);
      const visibleRoots = rootsExpanded ? roots : roots.slice(0, TREE_CHILDREN_PREVIEW);
      return <>{visibleRoots.map((root: any) => renderNode(root, 0))}
        {roots.length > visibleRoots.length && <button className="gh-btn" style={{ marginBottom: 8 }} onClick={() => toggleParent(rootsKey)}>+{roots.length - visibleRoots.length} more</button>}
        {rootsExpanded && roots.length > TREE_CHILDREN_PREVIEW && <button className="gh-btn" style={{ marginBottom: 8 }} onClick={() => toggleParent(rootsKey)}>Show less</button>}</>;
    })()}</div>{!nodes.length && !loading && <p style={{ color: 'var(--text-secondary)' }}>No lineage nodes yet.</p>}<p style={{ color: 'var(--text-secondary)', fontSize: '.78rem' }}>Nodes are read from lineage_nodes; pruning marks the branch and creates a SHA-256 proof, without deleting history.</p></section>}
    {tab === 'safety' && <section style={panel}><h3><ShieldCheck size={16} /> Abstention & anti-hallucination console</h3><label style={{ display: 'block', margin: '16px 0' }}>Abstention threshold: <strong>{threshold.toFixed(2)}</strong><input type="range" min="0.1" max="0.95" step="0.01" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: '100%' }} /></label><button className="gh-btn gh-btn-primary" onClick={runBench}><Play size={13} /> Run real ImpossibleBench</button>{bench && <div style={{ marginTop: 16 }}><p style={{ margin: '0 0 8px' }}>Threshold used for this run: <strong>{Number(bench.threshold ?? threshold).toFixed(2)}</strong> · abstentions: <strong>{benchAbstained}/{bench.results.length}</strong></p>{bench.results.map((r: any) => <div key={r.id} style={{ ...card, display: 'flex', justifyContent: 'space-between' }}><span>{r.id} · confidence {r.confidence}</span><strong style={{ color: r.correct ? 'var(--success)' : 'var(--danger)' }}>{r.abstained ? 'ABSTENTION' : 'ANSWER'} · {r.correct ? 'OK' : 'WRONG'}</strong></div>)}<p>Brier: <strong>{bench.brierScore}</strong> · score: <strong>{Math.round(bench.results.filter((r: any) => r.correct).length / bench.results.length * 100)}%</strong></p></div>}{benchHistory.length > 0 && <div style={{ marginTop: 16 }}><h4 style={{ margin: '0 0 8px', fontSize: '.9rem' }}>Recent runs (last {BENCH_HISTORY_LIMIT})</h4>{benchHistory.map((b: any) => { const abstained = b.results?.filter((r: any) => r.abstained).length ?? 0; return <div key={b.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', fontSize: '.82rem' }}><span>{b.id}</span><span>threshold <strong>{Number(b.threshold).toFixed(2)}</strong> · abstained <strong>{abstained}/{b.results?.length ?? 0}</strong> · Brier <strong>{b.brierScore}</strong></span></div>; })}</div>}</section>}
    {tab === 'provenance' && <section style={panel}><h3>Cryptographic provenance chain</h3><p style={{ color: 'var(--text-secondary)', fontSize: '.78rem' }}>Verification is not exposed by the backend yet; hashes can be copied for external audit.</p>{(data?.provenance || []).map((p: any) => <div key={p.id} style={card}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><strong>{p.subject_type}</strong> · {p.subject_id}</div><button className="gh-btn" title="Copy payload hash" onClick={() => copyHash(p.payload_hash)}><Copy size={12} /> Copy</button></div><code style={{ fontSize: '.72rem', wordBreak: 'break-all' }}>{p.payload_hash}</code><small style={{ display: 'block', color: 'var(--text-secondary)' }}>{p.algorithm} · {p.created_at}</small></div>)}</section>}
    {tab === 'swarm' && <section style={panel}><h3>Stigmergy markers & weighted quorum</h3><p>Agents: <strong>{data?.swarm?.agents?.length || 0}</strong> · messages: <strong>{data?.swarm?.messages?.length || 0}</strong> · average Brier: <strong>{data?.evaluations?.brierScore ?? '—'}</strong> · weight: <code>{data?.evaluations?.quorumWeightFormula}</code></p>{(data?.swarm?.weightedVotes || []).map((v: any) => <div key={v.agentId} style={card}><strong>{v.agentId}</strong> · vote weight <strong>{v.weight}</strong> · Brier {v.brierScore ?? '—'}</div>)}{(data?.swarm?.messages || []).slice(0, 20).map((m: any) => <div key={m.id} style={card}><strong>{m.agent_id || 'agent'}</strong> → {m.payload?.recipient || 'swarm'} <span style={{ color: 'var(--text-secondary)' }}> · {m.action}</span></div>)}</section>}
    {tab === 'compare' && <section style={panel}><h3>Comparing models, prompts, genomes and configurations</h3><p style={{ color: 'var(--text-secondary)' }}>Each run exposes its prompt/genome/config fingerprints and its model version.</p>{(data?.evaluations?.runs || []).map((r: any) => <div key={r.id} style={card}><strong>{r.benchmark}</strong> · {r.model_version} · score {r.score} · Brier {r.brier_score}<br /><small>prompt {r.prompt_hash?.slice(0, 16)}… · config {r.config_hash?.slice(0, 16)}…</small></div>)}<p style={{ marginTop: 20 }}>Skill transfer: use Genome Factory / Memory & Experience to cherry-pick an experience; provenance is preserved by the backend.</p></section>}
    {tab === 'notifications' && <section style={panel}><h3><Bell size={16} /> Configurable notifications</h3>{notifPrefs.map((n: any) => <label key={n.event_type} style={{ ...card, display: 'flex', justifyContent: 'space-between' }}><span>{n.event_type}</span><input type="checkbox" checked={Boolean(n.enabled)} onChange={(e) => setPrefEnabled(n.event_type, e.target.checked)} /></label>)}<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{prefsDirty && <span style={{ color: 'var(--warning)', fontSize: '.78rem' }}>Unsaved changes</span>}<button className="gh-btn" disabled={!prefsDirty} onClick={revertPrefs}><RotateCcw size={12} /> Revert</button><button className="gh-btn gh-btn-primary" onClick={updateNotifications}>Save policy</button></div></section>}
  </div>;
};

const panel: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: 6, padding: 18, minHeight: 320 };
const card: React.CSSProperties = { background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: 5, padding: 12, marginBottom: 8 };
