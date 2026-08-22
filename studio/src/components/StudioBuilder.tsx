import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, Check, CircleDot, Database, Download, GitBranch, GripVertical,
  Layers3, MessageSquare, Play, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal,
  Upload, Workflow, Zap,
} from 'lucide-react';
import {
  Background, Controls, MiniMap, ReactFlow, addEdge, useEdgesState, useNodesState,
  type Connection, type Edge, type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '../api/client';

type StudioTab = 'build' | 'prompts' | 'runs' | 'evals' | 'rag' | 'integrations' | 'deploy';
type SaveState = 'saved' | 'saving' | 'offline';

const initialNodes: Node[] = [
  { id: 'trigger', position: { x: 80, y: 180 }, data: { label: 'Trigger\nUser request' }, type: 'input' },
  { id: 'agent', position: { x: 430, y: 180 }, data: { label: 'Agent\nAdd a model step' }, type: 'default' },
];
const initialEdges: Edge[] = [{ id: 'e-trigger-agent', source: 'trigger', target: 'agent', animated: true }];

const tabItems: { id: StudioTab; label: string; icon: React.ReactNode }[] = [
  { id: 'build', label: 'Build', icon: <Workflow size={15} /> },
  { id: 'prompts', label: 'Prompt Lab', icon: <MessageSquare size={15} /> },
  { id: 'runs', label: 'Runs & traces', icon: <Activity size={15} /> },
  { id: 'evals', label: 'Evals', icon: <ShieldCheck size={15} /> },
  { id: 'rag', label: 'RAG', icon: <Database size={15} /> },
  { id: 'integrations', label: 'Integrations', icon: <Layers3 size={15} /> },
  { id: 'deploy', label: 'Deploy', icon: <Zap size={15} /> },
];

const muted: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: 12 };

export const StudioBuilder: React.FC = () => {
  const [tab, setTab] = useState<StudioTab>('build');
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState('agent');
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('New Studio workflow');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [runStatus, setRunStatus] = useState('');
  const [error, setError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api.listWorkflows().then((workflows: any[]) => {
      const workflow = Array.isArray(workflows) ? workflows[0] : null;
      if (cancelled || !workflow?.graph) return;
      setWorkflowId(workflow.id);
      setWorkflowName(workflow.name || 'Studio workflow');
      setNodes(workflow.graph.nodes || []);
      setEdges(workflow.graph.edges || []);
      setSaveState('saved');
    }).catch(() => { if (!cancelled) setSaveState('offline'); });
    return () => { cancelled = true; };
  }, [setEdges, setNodes]);

  const persistWorkflow = async () => {
    setError('');
    setSaveState('saving');
    const graph = { nodes, edges };
    try {
      const saved = workflowId
        ? await api.updateWorkflow(workflowId, { name: workflowName, graph })
        : await api.createWorkflow({ name: workflowName, description: 'Workflow created in GenOS Studio', graph });
      setWorkflowId(saved.id);
      setSaveState('saved');
      return saved.id as string;
    } catch (cause: any) {
      setSaveState('offline');
      setError(cause?.message || 'Workflow could not be saved.');
      return null;
    }
  };

  const runWorkflow = async () => {
    const id = workflowId || await persistWorkflow();
    if (!id) return;
    setError('');
    setRunStatus('queued');
    try {
      const result = await api.runWorkflow(id);
      setRunStatus(`${result.status || 'queued'} · ${result.id}`);
    } catch (cause: any) {
      setRunStatus('');
      setError(cause?.message || 'Workflow run could not be queued.');
    }
  };

  const exportWorkflow = () => {
    const payload = JSON.stringify({ name: workflowName, graph: { nodes, edges } }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${workflowName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'workflow'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importWorkflow = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!Array.isArray(payload?.graph?.nodes) || !Array.isArray(payload?.graph?.edges)) throw new Error('Invalid workflow graph.');
      setWorkflowId(null);
      setWorkflowName(payload.name || 'Imported Studio workflow');
      setNodes(payload.graph.nodes);
      setEdges(payload.graph.edges);
      setSaveState('saving');
      setError('Imported locally. Save workflow to persist it in the backend.');
    } catch (cause: any) {
      setError(cause?.message || 'Workflow file could not be imported.');
    } finally {
      event.target.value = '';
    }
  };

  const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge({ ...connection, animated: true }, current)), [setEdges]);
  const addWorkflowNode = (label: string) => {
    const id = `${label.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`;
    setNodes((current) => [...current, { id, position: { x: 420, y: 360 }, data: { label: `${label}\nNew node` }, type: 'default' }]);
  };
  const updateNodeLabel = (id: string, label: string) => setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, label } } : node));

  return <div className="studio-builder">
    <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importWorkflow} />
    <div className="studio-builder-header">
      <div><div className="eyebrow"><CircleDot size={12} color="var(--success)" /> STUDIO / WORKFLOW</div><h1>{workflowName} <span className="status-pill">{workflowId ? 'Saved' : 'Draft'}</span></h1><div style={muted}>Persisted workflow graph · {nodes.length} nodes · {edges.length} edges</div></div>
      <div className="builder-actions">
        <button className="studio-button secondary" onClick={() => importRef.current?.click()}><Upload size={14} /> Import</button>
        <button className="studio-button secondary" onClick={exportWorkflow}><Download size={14} /> Export</button>
        <button className="studio-button secondary" onClick={persistWorkflow}>{saveState === 'saving' ? 'Saving…' : saveState === 'offline' ? 'Retry save' : 'Save workflow'}</button>
        <button className="studio-button primary" onClick={runWorkflow}><Play size={14} /> Run workflow</button>
      </div>
    </div>
    {(error || runStatus) && <div className={error && !runStatus ? 'studio-error' : 'studio-notice'}>{error || `Run ${runStatus}`}</div>}
    <div className="studio-tabs">{tabItems.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.icon}{item.label}</button>)}</div>
    {tab === 'build' && <BuildView nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} selectedNode={selectedNode} setSelectedNode={setSelectedNode} addWorkflowNode={addWorkflowNode} updateNodeLabel={updateNodeLabel} onDeleteNode={(id: string) => { setNodes((current) => current.filter((node) => node.id !== id)); setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id)); setSelectedNode(''); }} />}
    {tab === 'prompts' && <PromptLab />}
    {tab === 'runs' && <RunsView />}
    {tab === 'evals' && <EvalsView />}
    {tab === 'rag' && <RagView />}
    {tab === 'integrations' && <IntegrationsView />}
    {tab === 'deploy' && <DeployView />}
  </div>;
};

function BuildView({ nodes, edges, onNodesChange, onEdgesChange, onConnect, selectedNode, setSelectedNode, addWorkflowNode, updateNodeLabel, onDeleteNode }: any) {
  const selected = nodes.find((node: Node) => node.id === selectedNode);
  return <div className="builder-grid"><aside className="builder-panel node-palette"><div className="panel-title">Node palette <SlidersHorizontal size={14} /></div><div className="palette-search"><Search size={14} /><input placeholder="Search nodes" /></div>{['LLM / Agent', 'Tool call', 'Condition', 'Parallel branch', 'Loop', 'Human review', 'Guardrail'].map((item) => <button key={item} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', item)} onClick={() => addWorkflowNode(item)} className="palette-item"><GripVertical size={14} />{item}<Plus size={13} /></button>)}<div className="palette-tip">Click a node type to add it to this workflow.</div></aside><section className="workflow-canvas"><div className="canvas-toolbar"><span><GitBranch size={14} /> Backend workflow graph</span><span style={muted}>Save to persist changes</span></div><div className="flow-wrap"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedNode(node.id)} fitView proOptions={{ hideAttribution: true }}><Background color="#30363d" gap={20} /><Controls /><MiniMap nodeColor="#58a6ff" maskColor="rgba(13,17,23,.7)" /></ReactFlow></div><div className="canvas-footer"><span><span className="live-dot" /> Local graph editor</span><span>{nodes.length} nodes · {edges.length} edges</span></div></section><aside className="builder-panel inspector"><div className="panel-title">Inspector <span className="mono">{selectedNode || 'none'}</span></div>{selected ? <><label>Node label<input value={String(selected.data?.label || '')} onChange={(event) => updateNodeLabel(selected.id, event.target.value)} /></label><div className="metric-list"><Metric label="Node type" value={selected.type || 'default'} /><Metric label="Outgoing edges" value={String(edges.filter((edge: Edge) => edge.source === selected.id).length)} /><Metric label="Incoming edges" value={String(edges.filter((edge: Edge) => edge.target === selected.id).length)} /></div><button className="studio-button danger" onClick={() => onDeleteNode(selected.id)} disabled={selected.type === 'input'}>Delete node</button></> : <p style={muted}>Select a node to inspect it.</p>}</aside></div>;
}

function PromptLab() {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');
  const [models, setModels] = useState('local://runtime');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => { try { const list = await api.listPrompts(); setPrompts(Array.isArray(list) ? list : []); } catch (cause: any) { setError(cause?.message || 'Prompts could not be loaded.'); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!selectedId) return;
    api.getPrompt(selectedId).then((prompt: any) => { const version = prompt.versions?.[0]; setName(prompt.name || ''); setTemplate(version?.template || ''); setModels(version?.model || 'local://runtime'); }).catch((cause: any) => setError(cause?.message || 'Prompt could not be loaded.'));
  }, [selectedId]);
  const save = async () => {
    setLoading(true); setError('');
    try {
      const result = selectedId ? await api.createPromptVersion(selectedId, { template, model: models }) : await api.createPrompt({ name: name || 'Untitled prompt', template, model: models });
      if (!selectedId && result.id) setSelectedId(result.id);
      setStatus(`Saved prompt version ${result.version || ''}`); await load();
    } catch (cause: any) { setError(cause?.message || 'Prompt could not be saved.'); } finally { setLoading(false); }
  };
  const run = async () => { setLoading(true); setError(''); try { const result = await api.runPlayground({ prompt: template, models: models.split(',').map((item) => item.trim()).filter(Boolean) }); setStatus(`Backend playground: ${result.status || 'accepted'}`); } catch (cause: any) { setError(cause?.message || 'Playground run failed.'); } finally { setLoading(false); } };
  return <div className="prompt-layout"><section className="prompt-editor"><div className="section-heading"><div><div className="eyebrow">PROMPT REGISTRY</div><h2>Versioned prompt editor</h2></div><button className="studio-button secondary" onClick={() => { setSelectedId(''); setName(''); setTemplate(''); setModels('local://runtime'); }}><Plus size={13} /> New</button></div><label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Prompt name" /></label><label>Existing prompt<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">New prompt</option>{prompts.map((prompt) => <option value={prompt.id} key={prompt.id}>{prompt.name} · v{prompt.current_version}</option>)}</select></label><textarea className="prompt-textarea" value={template} onChange={(event) => setTemplate(event.target.value)} placeholder="Write a prompt with {{variables}}" /><label>Model or models<input value={models} onChange={(event) => setModels(event.target.value)} /></label><button className="studio-button primary" onClick={save} disabled={loading || !template.trim()}>{loading ? 'Saving…' : 'Save version'}</button></section><section className="playground"><div className="section-heading"><div><div className="eyebrow">BACKEND PLAYGROUND</div><h2>Queue a real run</h2></div><button className="studio-button primary" onClick={run} disabled={loading || !template.trim()}><Play size={13} /> Run</button></div><p style={muted}>The backend returns the persisted queue status. No fabricated model output is shown.</p>{status && <div className="studio-notice">{status}</div>}{error && <div className="studio-error">{error}</div>}</section></div>;
}

function RunsView() {
  const [traces, setTraces] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const load = async () => { try { const list = await api.listTraces(); setTraces(Array.isArray(list) ? list : []); } catch (cause: any) { setStatus(cause?.message || 'Traces could not be loaded.'); } };
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => traces.filter((trace) => String(trace.trace_id).toLowerCase().includes(query.toLowerCase())), [traces, query]);
  const replay = async (traceId: string) => { try { const result = await api.replayTrace(traceId); setStatus(`Replay ${result.status || 'queued'} · ${result.replayId}`); } catch (cause: any) { setStatus(cause?.message || 'Replay failed.'); } };
  return <div className="traces-layout"><aside className="builder-panel trace-list"><div className="section-heading"><h2>Trace explorer</h2><button className="icon-button" onClick={load} aria-label="Refresh traces"><RefreshCw size={14} /></button></div><div className="palette-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter trace ids…" /></div>{filtered.map((trace) => <button className="trace-row" key={trace.trace_id} onClick={() => setStatus(`Selected ${trace.trace_id}`)}><strong>{trace.trace_id}</strong><small>{trace.span_count} spans · {trace.duration_ms} ms · {trace.error_count} errors</small></button>)}{filtered.length === 0 && <p style={muted}>No traces persisted in the backend.</p>}</aside><section className="trace-detail"><div className="section-heading"><div><div className="eyebrow">OPEN TELEMETRY STORAGE</div><h2>Runs & traces</h2><p style={muted}>Trace rows are loaded from the backend trace_spans table.</p></div></div>{status && <div className="studio-notice">{status}</div>}{filtered[0] && <button className="studio-button primary" onClick={() => replay(filtered[0].trace_id)}><Play size={13} /> Replay selected trace</button>}</section></div>;
}

function EvalsView() {
  const [overview, setOverview] = useState<any>(null);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const load = async () => { try { const [nextOverview, nextDatasets, nextJobs] = await Promise.all([api.getEvaluationOverview(), api.listDatasets(), api.listEvaluationJobs()]); setOverview(nextOverview); setDatasets(nextDatasets || []); setJobs(nextJobs || []); } catch (cause: any) { setStatus(cause?.message || 'Evaluation data could not be loaded.'); } };
  useEffect(() => { void load(); }, []);
  const runBench = async () => { try { const result = await api.runImpossibleBench(); setStatus(`ImpossibleBench completed: ${result.results?.length || 0} cases`); await load(); } catch (cause: any) { setStatus(cause?.message || 'ImpossibleBench failed.'); } };
  const runs = overview?.evaluations?.runs || [];
  const nodes = overview?.mcts?.nodes || [];
  return <div className="feature-grid"><div className="wide-card"><div className="section-heading"><div><div className="eyebrow">EVALUATION OBSERVABILITY</div><h2>Backend evaluation state</h2></div><button className="studio-button secondary" onClick={load}><RefreshCw size={13} /> Refresh</button></div><div className="score-row"><Metric label="Evaluation runs" value={String(runs.length)} /><Metric label="MCTS nodes" value={String(nodes.length)} /><Metric label="Datasets" value={String(datasets.length)} /><Metric label="Queued jobs" value={String(jobs.filter((job) => job.status === 'queued').length)} /></div><button className="studio-button primary" onClick={runBench}><Play size={13} /> Run ImpossibleBench</button>{status && <div className="studio-notice">{status}</div>}</div></div>;
}

function RagView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  useEffect(() => { api.listRagDocuments().then((items: any[]) => setDocuments(items || [])).catch(() => undefined); }, []);
  const search = async (event: React.FormEvent) => { event.preventDefault(); if (!query.trim()) return; try { setResults(await api.searchRag(query)); setStatus(''); } catch (cause: any) { setStatus(cause?.message || 'RAG search failed.'); } };
  return <div className="rag-layout"><section className="wide-card"><div className="section-heading"><div><div className="eyebrow">DOCUMENT INDEX</div><h2>RAG retrieval inspector</h2></div><span className="status-pill">{documents.length} documents</span></div><form className="palette-search" onSubmit={search}><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search indexed chunks…" /><button className="studio-button primary" type="submit">Search</button></form>{status && <div className="studio-error">{status}</div>}{results.length === 0 ? <p style={muted}>No indexed chunks returned by the backend.</p> : results.map((item, index) => <div className="retrieval-row" key={item.id || index}><span className="rank">{index + 1}</span><div><strong>{item.document_name || item.id || 'Chunk'}</strong><p style={muted}>{item.content || 'Empty chunk'}</p></div><span className="score">{Number(item.score || 0).toFixed(3)}</span></div>)}</section></div>;
}

function IntegrationsView() {
  const [providers, setProviders] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [ides, setIdes] = useState<any[]>([]);
  const [installed, setInstalled] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const load = async () => { try { const [providerList, toolList, ideList, integrations] = await Promise.all([api.getPlatformProviders(), api.listTools(), api.listIdeIntegrations(), api.listIntegrations()]); setProviders(providerList || []); setTools(toolList || []); setIdes(ideList || []); setInstalled(integrations || []); } catch (cause: any) { setStatus(cause?.message || 'Integrations could not be loaded.'); } };
  useEffect(() => { void load(); }, []);
  return <div className="feature-grid"><div className="wide-card"><div className="section-heading"><h2>Connected backend capabilities</h2><button className="studio-button secondary" onClick={load}><RefreshCw size={13} /> Refresh</button></div><div className="score-row"><Metric label="Model providers" value={String(providers.length)} /><Metric label="MCP tools" value={String(tools.length)} /><Metric label="IDE integrations" value={String(ides.length)} /><Metric label="Installed connectors" value={String(installed.length)} /></div>{status && <div className="studio-error">{status}</div>}<div className="retrieval-row"><Check size={14} color="var(--success)" /><span>{providers.map((provider) => `${provider.provider}/${provider.model}`).join(' · ') || 'No providers registered'}</span></div><div className="retrieval-row"><Check size={14} color="var(--success)" /><span>{tools.map((tool) => tool.name || tool.toolName).join(' · ') || 'No MCP tools registered'}</span></div><div className="retrieval-row"><Check size={14} color="var(--success)" /><span>{installed.map((item) => `${item.name} · ${item.status}`).join(' · ') || 'No connectors installed'}</span></div><div className="retrieval-row"><Check size={14} color="var(--success)" /><span>{ides.map((ide) => `${ide.ide} · ${ide.status}`).join(' · ') || 'No IDE integration connected'}</span></div></div></div>;
}

function DeployView() {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [telemetry, setTelemetry] = useState<any>(null);
  const [result, setResult] = useState('');
  const [workers, setWorkers] = useState<any>(null);
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => { try { const [nextStatus, nextTelemetry, workerHealth, releaseList] = await Promise.all([api.getStatus(), api.getPlatformTelemetry(), api.getWorkerHealth(), api.listReleases()]); setStatus(nextStatus); setTelemetry(nextTelemetry); setWorkers(workerHealth); setReleases(releaseList || []); } catch (cause: any) { setResult(cause?.message || 'Runtime status could not be loaded.'); } };
  useEffect(() => { void load(); }, []);
  const deploy = async () => { setLoading(true); setResult(''); try { const response = await api.deployAgent({ prompt: prompt.trim(), agentType: 'genos', modelTier: 'flash' }); setResult(`Deployment accepted: ${response.agent?.id || response.id || 'backend response received'}`); await load(); } catch (cause: any) { setResult(cause?.message || 'Deployment failed.'); } finally { setLoading(false); } };
  return <div className="deploy-layout"><div className="wide-card"><div className="section-heading"><div><div className="eyebrow">RUNTIME DEPLOYMENT</div><h2>Deploy an agent through the backend</h2></div><button className="studio-button secondary" onClick={load}><RefreshCw size={13} /> Refresh</button></div><label>Mission prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the mission to deploy…" /></label><button className="studio-button primary" onClick={deploy} disabled={loading || !prompt.trim()}>{loading ? 'Deploying…' : 'Deploy agent'} <ArrowRight size={14} /></button>{result && <div className="studio-notice">{result}</div>}</div><div className="wide-card"><h2>Live runtime telemetry</h2><div className="score-row"><Metric label="Active agents" value={String(status?.activeAgentsCount ?? 0)} /><Metric label="Telemetry events" value={String(telemetry?.totals?.events ?? 0)} /><Metric label="Tokens" value={String(telemetry?.totals?.tokens ?? 0)} /><Metric label="Cost" value={`$${Number(telemetry?.totals?.costUsd || 0).toFixed(4)}`} /></div><div className="score-row"><Metric label="Workers" value={`${workers?.active ?? 0}/${workers?.workers ?? 0}`} /><Metric label="Queue depth" value={String(workers?.queueDepth ?? 0)} /><Metric label="Retries" value={String(workers?.retries ?? 0)} /><Metric label="Releases" value={String(releases.length)} /></div></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
