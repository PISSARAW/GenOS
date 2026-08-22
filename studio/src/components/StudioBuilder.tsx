import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, Check, CircleDot, Database, Download, GitBranch, GripVertical,
  Layers3, MessageSquare, Play, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal,
  Upload, Workflow, X, Zap,
} from 'lucide-react';
import {
  Background, Controls, MiniMap, ReactFlow, addEdge, useEdgesState, useNodesState,
  type Connection, type Edge, type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api, openApiEventStream } from '../api/client';

type StudioTab = 'build' | 'prompts' | 'runs' | 'evals' | 'rag' | 'integrations' | 'deploy';
type SaveState = 'saved' | 'saving' | 'dirty' | 'offline';

const initialNodes: Node[] = [
  { id: 'trigger', position: { x: 80, y: 180 }, data: { label: 'Trigger\nUser request' }, type: 'input' },
  { id: 'agent', position: { x: 430, y: 180 }, data: { label: 'LLM / Agent\nConfigure a real model', kind: 'llm', model: '', prompt: '{{input.prompt}}' }, type: 'default' },
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
const paletteItems = ['LLM / Agent', 'Tool call', 'Condition', 'Parallel branch', 'Loop', 'Human review', 'Guardrail'];
const muted: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: 12 };
const messageOf = (cause: any, fallback: string) => cause?.message || fallback;

export const StudioBuilder: React.FC<{ workspaceId?: string | null; workspaceName?: string }> = ({ workspaceId = null, workspaceName }) => {
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
      const loadedNodes = workflow.graph.nodes || [];
      setWorkflowId(workflow.id);
      setWorkflowName(workflow.name || 'Studio workflow');
      setNodes(loadedNodes);
      setEdges(workflow.graph.edges || []);
      setSelectedNode(loadedNodes[0]?.id || '');
      setSaveState('saved');
    }).catch((cause) => { if (!cancelled) { setSaveState('offline'); setError(messageOf(cause, 'Workflows could not be loaded.')); } });
    return () => { cancelled = true; };
  }, [setEdges, setNodes]);

  const markDirty = useCallback(() => setSaveState((state) => state === 'saving' ? state : 'dirty'), []);
  const handleNodesChange = useCallback((changes: any[]) => { markDirty(); onNodesChange(changes); }, [markDirty, onNodesChange]);
  const handleEdgesChange = useCallback((changes: any[]) => { markDirty(); onEdgesChange(changes); }, [markDirty, onEdgesChange]);

  const persistWorkflow = async () => {
    setError(''); setSaveState('saving');
    try {
      const graph = { nodes, edges };
      const saved = workflowId ? await api.updateWorkflow(workflowId, { name: workflowName, graph }) : await api.createWorkflow({ name: workflowName, description: 'Workflow created in GenOS Studio', graph });
      setWorkflowId(saved.id); setSaveState('saved'); return saved.id as string;
    } catch (cause: any) { const detail = messageOf(cause, 'Workflow could not be saved.'); setSaveState(/network|failed to fetch/i.test(detail) ? 'offline' : 'dirty'); setError(detail); return null; }
  };

  const runWorkflow = async () => {
    const id = workflowId || await persistWorkflow();
    if (!id) return;
    setError(''); setRunStatus('Validating workflow…');
    try {
      const validation = await api.validateWorkflow(id, { nodes, edges });
      if (!validation.valid) { setRunStatus(''); setError(`Workflow invalid: ${(validation.errors || []).join(', ') || 'validation failed'}`); return; }
      setRunStatus('Queueing workflow…'); const result = await api.runWorkflow(id); setRunStatus(`${result.status || 'queued'} · ${result.id}`);
    } catch (cause: any) { setRunStatus(''); setError(messageOf(cause, 'Workflow run could not be queued.')); }
  };

  const exportWorkflow = () => {
    const payload = JSON.stringify({ name: workflowName, graph: { nodes, edges } }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' })); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${workflowName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'workflow'}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  const importWorkflow = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const payload = JSON.parse(await file.text()); if (!Array.isArray(payload?.graph?.nodes) || !Array.isArray(payload?.graph?.edges)) throw new Error('Invalid workflow graph.');
      setWorkflowId(null); setWorkflowName(payload.name || 'Imported Studio workflow'); setNodes(payload.graph.nodes); setEdges(payload.graph.edges); setSaveState('dirty'); setError('Imported locally. Save workflow to persist it in the backend.');
    } catch (cause: any) { setError(messageOf(cause, 'Workflow file could not be imported.')); } finally { event.target.value = ''; }
  };
  const onConnect = useCallback((connection: Connection) => { markDirty(); setEdges((current) => addEdge({ ...connection, animated: true }, current)); }, [markDirty, setEdges]);
  const addWorkflowNode = (label: string) => {
    const id = `${label.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`;
    const kind = label === 'LLM / Agent' ? 'llm' : label === 'Tool call' ? 'tool' : label === 'Parallel branch' ? 'parallel' : label.toLowerCase().replace(/\s+/g, '_');
    const data = kind === 'llm' ? { label: `${label}\nConfigure a real model`, kind, model: '', prompt: '{{input.prompt}}' } : { label: `${label}\nNew node`, kind };
    setNodes((current) => [...current, { id, position: { x: 420, y: 360 }, data, type: 'default' }]);
    setEdges((current) => { const source = selectedNode && nodes.some((node) => node.id === selectedNode) ? selectedNode : nodes[0]?.id; return source ? [...current, { id: `edge-${source}-${id}`, source, target: id, animated: true }] : current; });
    setSelectedNode(id); markDirty();
  };
  const updateNodeLabel = (id: string, label: string) => { markDirty(); setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, label } } : node)); };
  const updateNodeData = (id: string, key: string, value: string) => { markDirty(); setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, [key]: value } } : node)); };
  const deleteNode = (id: string) => { markDirty(); setNodes((current) => current.filter((node) => node.id !== id)); setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id)); setSelectedNode(nodes.find((node) => node.id !== id)?.id || ''); };

  return <div className="studio-builder">
    <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importWorkflow} />
    <div className="studio-builder-header"><div><div className="eyebrow"><CircleDot size={12} color="var(--success)" /> STUDIO / WORKFLOW</div><h1>{workflowName} <span className="status-pill">{saveState === 'saved' ? 'Saved' : saveState === 'offline' ? 'Offline' : saveState === 'saving' ? 'Saving' : 'Unsaved'}</span></h1><div style={muted}>Persisted workflow graph · {nodes.length} nodes · {edges.length} edges</div></div><div className="builder-actions"><button className="studio-button secondary" onClick={() => importRef.current?.click()}><Upload size={14} /> Import</button><button className="studio-button secondary" onClick={exportWorkflow}><Download size={14} /> Export</button><button className="studio-button secondary" onClick={persistWorkflow} disabled={saveState === 'saving'}>{saveState === 'saving' ? 'Saving…' : saveState === 'offline' ? 'Retry save' : 'Save workflow'}</button><button className="studio-button primary" onClick={runWorkflow} disabled={saveState === 'saving'}><Play size={14} /> Run workflow</button></div></div>
    {(error || runStatus) && <div className={error && !runStatus ? 'studio-error' : 'studio-notice'}>{error || `Run ${runStatus}`}</div>}
    <div className="studio-tabs">{tabItems.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.icon}{item.label}</button>)}</div>
    {tab === 'build' && <BuildView nodes={nodes} edges={edges} onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange} onConnect={onConnect} selectedNode={selectedNode} setSelectedNode={setSelectedNode} addWorkflowNode={addWorkflowNode} updateNodeLabel={updateNodeLabel} updateNodeData={updateNodeData} onDeleteNode={deleteNode} />}
    {tab === 'prompts' && <PromptLab />}{tab === 'runs' && <RunsView />}{tab === 'evals' && <EvalsView />}{tab === 'rag' && <RagView />}{tab === 'integrations' && <IntegrationsView />}{tab === 'deploy' && <DeployView workflowId={workflowId} workspaceId={workspaceId} workspaceName={workspaceName} />}
  </div>;
};

function BuildView({ nodes, edges, onNodesChange, onEdgesChange, onConnect, selectedNode, setSelectedNode, addWorkflowNode, updateNodeLabel, updateNodeData, onDeleteNode }: any) {
  const [query, setQuery] = useState(''); const selected = nodes.find((node: Node) => node.id === selectedNode); const visibleItems = paletteItems.filter((item) => item.toLowerCase().includes(query.toLowerCase()));
  const isLlmNode = /\b(llm|agent|model)\b/i.test([selected?.data?.kind, selected?.data?.label].filter(Boolean).join(' '));
  return <div className="builder-grid"><aside className="builder-panel node-palette"><div className="panel-title">Node palette <SlidersHorizontal size={14} /></div><div className="palette-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search nodes" /></div>{visibleItems.map((item) => <button key={item} onClick={() => addWorkflowNode(item)} className="palette-item"><GripVertical size={14} />{item}<Plus size={13} /></button>)}{visibleItems.length === 0 && <p style={muted}>No node type matches this search.</p>}<div className="palette-tip">Click a node type to add it and connect it to the selected node.</div></aside><section className="workflow-canvas"><div className="canvas-toolbar"><span><GitBranch size={14} /> Backend workflow graph</span><span style={muted}>Save to persist changes</span></div><div className="flow-wrap"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedNode(node.id)} fitView proOptions={{ hideAttribution: true }}><Background color="#30363d" gap={20} /><Controls /><MiniMap nodeColor="#58a6ff" maskColor="rgba(13,17,23,.7)" /></ReactFlow></div><div className="canvas-footer"><span><span className="live-dot" /> Backend graph editor</span><span>{nodes.length} nodes · {edges.length} edges</span></div></section><aside className="builder-panel inspector"><div className="panel-title">Inspector <span className="mono">{selectedNode || 'none'}</span></div>{selected ? <><label>Node label<input value={String(selected.data?.label || '')} onChange={(event) => updateNodeLabel(selected.id, event.target.value)} /></label>{isLlmNode && <><label>Model URI<input value={String(selected.data?.model || '')} onChange={(event) => updateNodeData(selected.id, 'model', event.target.value)} placeholder="openai://gpt-4o-mini" /></label><label>Prompt template<textarea value={String(selected.data?.prompt || '')} onChange={(event) => updateNodeData(selected.id, 'prompt', event.target.value)} placeholder="{{input.prompt}}" /></label><p style={muted}>The worker invokes this configured provider and persists the response in the workflow trace.</p></>}<div className="metric-list"><Metric label="Node kind" value={selected.data?.kind || selected.type || 'default'} /><Metric label="Outgoing edges" value={String(edges.filter((edge: Edge) => edge.source === selected.id).length)} /><Metric label="Incoming edges" value={String(edges.filter((edge: Edge) => edge.target === selected.id).length)} /></div><button className="studio-button danger" onClick={() => onDeleteNode(selected.id)} disabled={selected.type === 'input'}><X size={13} /> Delete node</button></> : <p style={muted}>Select a node to inspect it.</p>}</aside></div>;
}

function PromptLab() {
  const [prompts, setPrompts] = useState<any[]>([]); const [selectedId, setSelectedId] = useState(''); const [version, setVersion] = useState(1); const [name, setName] = useState(''); const [template, setTemplate] = useState(''); const [models, setModels] = useState(''); const [variables, setVariables] = useState('{}'); const [result, setResult] = useState<any>(null); const [streamText, setStreamText] = useState(''); const [status, setStatus] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [action, setAction] = useState('');
  const load = async () => { setLoading(true); try { const list = await api.listPrompts(); setPrompts(Array.isArray(list) ? list : []); } catch (cause: any) { setError(messageOf(cause, 'Prompts could not be loaded.')); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!selectedId) return; setAction('Loading prompt…'); api.getPrompt(selectedId).then((prompt: any) => { const current = prompt.versions?.[0]; setName(prompt.name || ''); setVersion(current?.version || prompt.current_version || 1); setTemplate(current?.template || ''); setModels(current?.model || ''); setAction(''); }).catch((cause: any) => { setAction(''); setError(messageOf(cause, 'Prompt could not be loaded.')); }); }, [selectedId]);
  const reset = () => { setSelectedId(''); setVersion(1); setName(''); setTemplate(''); setModels(''); setVariables('{}'); setResult(null); setStatus(''); setError(''); };
  const parseVariables = () => { try { const parsed = JSON.parse(variables || '{}'); if (!parsed || Array.isArray(parsed)) throw new Error('Variables must be a JSON object.'); return parsed; } catch (cause: any) { throw new Error(messageOf(cause, 'Variables must be valid JSON.')); } };
  const save = async () => { setAction('Saving…'); setError(''); try { const response = selectedId ? await api.createPromptVersion(selectedId, { template, model: models }) : await api.createPrompt({ name: name || 'Untitled prompt', template, model: models }); if (!selectedId && response.id) setSelectedId(response.id); setStatus(`Saved prompt version ${response.version || version}`); await load(); } catch (cause: any) { setError(messageOf(cause, 'Prompt could not be saved.')); } finally { setAction(''); } };
  const run = async () => {
    setAction('Running…'); setError(''); setStreamText('');
    try {
      const response = await api.runPlayground({ prompt: template, models: models.split(',').map((item) => item.trim()).filter(Boolean), variables: parseVariables() });
      setResult(response); setStatus(`Backend playground: ${response.status || 'accepted'}`);
      const stream = await openApiEventStream(api.streamModelJob(response.id));
      if (!stream.body) throw new Error('The backend did not provide a readable token stream.');
      const reader = stream.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      let completed = false;
      while (!completed) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const messages = buffer.split(/\n\n/); buffer = messages.pop() || '';
        for (const message of messages) {
          const event = message.match(/^event:\s*(.+)$/m)?.[1] || 'message';
          const raw = message.match(/^data:\s*(.+)$/m)?.[1];
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (event === 'token') setStreamText((current) => `${current}${current ? ' ' : ''}${data.token}`);
          if (event === 'done') { completed = true; break; }
        }
        if (done) break;
      }
      if (!completed) throw new Error('Token stream ended before the backend completed the job.');
    } catch (cause: any) {
      setError(messageOf(cause, 'Playground run failed.'));
    } finally {
      setAction('');
    }
  };
  const render = async () => { if (!selectedId) { setError('Save the prompt before rendering a version.'); return; } setAction('Rendering…'); setError(''); try { setResult(await api.renderPrompt(selectedId, version, parseVariables())); setStatus('Prompt rendered by the backend.'); } catch (cause: any) { setError(messageOf(cause, 'Prompt rendering failed.')); } finally { setAction(''); } };
  return <div className="prompt-layout"><section className="prompt-editor"><div className="section-heading"><div><div className="eyebrow">PROMPT REGISTRY</div><h2>Versioned prompt editor</h2></div><button className="studio-button secondary" onClick={reset}><Plus size={13} /> New</button></div>{loading ? <p style={muted}>Loading prompts…</p> : <><label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Prompt name" /></label><label>Existing prompt<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">New prompt</option>{prompts.map((prompt) => <option value={prompt.id} key={prompt.id}>{prompt.name} · v{prompt.current_version}</option>)}</select></label><textarea className="prompt-textarea" value={template} onChange={(event) => setTemplate(event.target.value)} placeholder="Write a prompt with {{variables}}" /><label>Model URI(s)<input value={models} onChange={(event) => setModels(event.target.value)} placeholder="openai://gpt-4o-mini" /></label><label>Variables (JSON)<textarea className="variables-textarea" value={variables} onChange={(event) => setVariables(event.target.value)} placeholder='{"name":"Ada"}' /></label><div className="builder-actions"><button className="studio-button primary" onClick={save} disabled={!!action || !template.trim() || !models.trim()}>{action === 'Saving…' ? 'Saving…' : 'Save version'}</button><button className="studio-button secondary" onClick={render} disabled={!!action || !selectedId || !template.trim()}>Render version</button></div></>}</section><section className="playground"><div className="section-heading"><div><div className="eyebrow">BACKEND PLAYGROUND</div><h2>Live provider stream</h2></div><button className="studio-button primary" onClick={run} disabled={!!action || !template.trim() || !models.trim()}><Play size={13} /> {action === 'Running…' ? 'Streaming…' : 'Run'}</button></div><p style={muted}>Tokens arrive from the configured provider through the backend worker over Server-Sent Events.</p>{status && <div className="studio-notice">{status}</div>}{streamText && <pre className="stream-output">{streamText}</pre>}{error && <div className="studio-error">{error}</div>}{result && <div className="result-card"><div><strong>Backend response</strong><span className="result-meta">{result.status || (result.rendered ? 'rendered' : 'received')}</span></div>{result.rendered && <pre>{result.rendered}</pre>}{result.status === 'queued' && <p style={muted}>Run queued; stream is active above.</p>}</div>}</section></div>;
}

function RunsView() {
  const [traces, setTraces] = useState<any[]>([]); const [query, setQuery] = useState(''); const [selectedTraceId, setSelectedTraceId] = useState(''); const [detail, setDetail] = useState<any>(null); const [status, setStatus] = useState(''); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const list = await api.listTraces(); const next = Array.isArray(list) ? list : []; setTraces(next); setSelectedTraceId((current) => current && next.some((item) => item.trace_id === current) ? current : next[0]?.trace_id || ''); } catch (cause: any) { setStatus(messageOf(cause, 'Traces could not be loaded.')); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []); useEffect(() => { if (!selectedTraceId) { setDetail(null); return; } setDetail(null); api.getTrace(selectedTraceId).then(setDetail).catch((cause: any) => setStatus(messageOf(cause, 'Trace detail could not be loaded.'))); }, [selectedTraceId]);
  const filtered = useMemo(() => traces.filter((trace) => String(trace.trace_id).toLowerCase().includes(query.toLowerCase())), [traces, query]);
  const replay = async () => { if (!selectedTraceId) return; try { const result = await api.replayTrace(selectedTraceId); setStatus(`Replay ${result.status || 'queued'} · ${result.replayId}`); } catch (cause: any) { setStatus(messageOf(cause, 'Replay failed.')); } };
  return <div className="traces-layout"><aside className="builder-panel trace-list"><div className="section-heading"><h2>Trace explorer</h2><button className="icon-button" onClick={load} aria-label="Refresh traces"><RefreshCw size={14} /></button></div><div className="palette-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter trace ids…" /></div>{loading ? <p style={muted}>Loading traces…</p> : filtered.map((trace) => <button className={`trace-row ${trace.trace_id === selectedTraceId ? 'selected' : ''}`} key={trace.trace_id} onClick={() => setSelectedTraceId(trace.trace_id)}><span className="trace-status" style={{ background: trace.error_count ? 'var(--danger)' : 'var(--success)' }} /><span><strong>{trace.trace_id}</strong><small>{trace.span_count} spans · {trace.duration_ms} ms · {trace.error_count} errors</small></span></button>)}{!loading && filtered.length === 0 && <p style={muted}>No traces persisted in the backend.</p>}</aside><section className="trace-detail"><div className="section-heading"><div><div className="eyebrow">OPEN TELEMETRY STORAGE</div><h2>{selectedTraceId || 'Runs & traces'}</h2><p style={muted}>Trace rows and spans are loaded from the backend trace_spans table.</p></div>{selectedTraceId && <button className="studio-button primary" onClick={replay}><Play size={13} /> Replay selected trace</button>}</div>{status && <div className="studio-notice">{status}</div>}{detail?.spans?.length ? <><div className="trace-metrics"><Metric label="Spans" value={String(detail.spans.length)} /><Metric label="Errors" value={String(detail.spans.filter((span: any) => span.error).length)} /><Metric label="Agent" value={String(detail.spans[0]?.agent_id || 'unknown')} /><Metric label="Trace ID" value={detail.traceId} /></div><div className="span-timeline">{detail.spans.map((span: any) => <div className="span-inspector" key={span.id}><div className="section-heading"><strong>{span.name}</strong><span style={muted}>{span.end_time ? `${Math.max(0, span.end_time - span.start_time)} ms` : 'open span'}</span></div><pre>{JSON.stringify({ inputs: span.inputs, outputs: span.outputs, error: span.error || null }, null, 2)}</pre></div>)}</div></> : <p style={muted}>{selectedTraceId ? 'Loading trace detail…' : 'Select a persisted trace to inspect its spans and replay it.'}</p>}</section></div>;
}

function EvalsView() {
  const [overview, setOverview] = useState<any>(null); const [datasets, setDatasets] = useState<any[]>([]); const [jobs, setJobs] = useState<any[]>([]); const [bench, setBench] = useState<any>(null); const [status, setStatus] = useState(''); const [loading, setLoading] = useState(true); const [running, setRunning] = useState(false);
  const load = async () => { setLoading(true); const responses = await Promise.allSettled([api.getEvaluationOverview(), api.listDatasets(), api.listEvaluationJobs()]); const [overviewResult, datasetsResult, jobsResult] = responses; if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value); if (datasetsResult.status === 'fulfilled') setDatasets(datasetsResult.value || []); if (jobsResult.status === 'fulfilled') setJobs(jobsResult.value || []); const failed = responses.find((item) => item.status === 'rejected'); if (failed) setStatus(messageOf((failed as PromiseRejectedResult).reason, 'Some evaluation data could not be loaded.')); setLoading(false); };
  useEffect(() => { void load(); }, []); const runBench = async () => { setRunning(true); setStatus(''); try { const result = await api.runImpossibleBench(); setBench(result); setStatus(`ImpossibleBench completed: ${result.results?.length || 0} cases`); await load(); } catch (cause: any) { setStatus(messageOf(cause, 'ImpossibleBench failed.')); } finally { setRunning(false); } };
  const runs = overview?.evaluations?.runs || []; const nodes = overview?.mcts?.nodes || [];
  return <div className="feature-grid"><div className="wide-card"><div className="section-heading"><div><div className="eyebrow">EVALUATION OBSERVABILITY</div><h2>Backend evaluation state</h2></div><button className="studio-button secondary" onClick={load} disabled={loading}><RefreshCw size={13} /> Refresh</button></div>{loading ? <p style={muted}>Loading evaluation state…</p> : <><div className="score-row"><Metric label="Evaluation runs" value={String(runs.length)} /><Metric label="MCTS nodes" value={String(nodes.length)} /><Metric label="Datasets" value={String(datasets.length)} /><Metric label="Queued jobs" value={String(jobs.filter((job) => job.status === 'queued').length)} /></div><button className="studio-button primary" onClick={runBench} disabled={running}>{running ? 'Running…' : 'Run ImpossibleBench'} <Play size={13} /></button></>}{status && <div className="studio-notice">{status}</div>}{bench?.results && <div className="result-card"><div><strong>{bench.benchmark}</strong><span className="result-meta">Brier score {bench.brierScore}</span></div>{bench.results.map((item: any) => <div className="retrieval-row" key={item.id}><span className="rank">{item.correct ? <Check size={13} /> : '!'}</span><span>{item.prompt}</span><span className="score">{item.abstained ? 'abstained' : item.confidence}</span></div>)}</div>}</div></div>;
}

function RagView() {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<any[]>([]); const [documents, setDocuments] = useState<any[]>([]); const [documentName, setDocumentName] = useState(''); const [documentContent, setDocumentContent] = useState(''); const [status, setStatus] = useState(''); const [loading, setLoading] = useState(true); const [action, setAction] = useState('');
  const load = async () => { setLoading(true); try { const items = await api.listRagDocuments(); setDocuments(Array.isArray(items) ? items : []); } catch (cause: any) { setStatus(messageOf(cause, 'RAG documents could not be loaded.')); } finally { setLoading(false); } }; useEffect(() => { void load(); }, []);
  const ingest = async (event: React.FormEvent) => { event.preventDefault(); setAction('Ingesting…'); setStatus(''); try { const response = await api.ingestRagDocument({ name: documentName.trim(), content: documentContent }); setStatus(`Indexed ${response.chunks} chunk${response.chunks === 1 ? '' : 's'} in ${response.name}.`); setDocumentName(''); setDocumentContent(''); await load(); } catch (cause: any) { setStatus(messageOf(cause, 'Document ingestion failed.')); } finally { setAction(''); } };
  const search = async (event: React.FormEvent) => { event.preventDefault(); if (!query.trim()) { setResults([]); return; } setAction('Searching…'); setStatus(''); try { setResults(await api.searchRag(query)); } catch (cause: any) { setStatus(messageOf(cause, 'RAG search failed.')); } finally { setAction(''); } };
  return <div className="rag-layout"><section className="wide-card"><div className="section-heading"><div><div className="eyebrow">DOCUMENT INDEX</div><h2>RAG retrieval inspector</h2></div><span className="status-pill">{documents.length} documents</span></div><form className="rag-ingest" onSubmit={ingest}><input value={documentName} onChange={(event) => setDocumentName(event.target.value)} placeholder="Document name" /><textarea value={documentContent} onChange={(event) => setDocumentContent(event.target.value)} placeholder="Paste document content to index…" /><button className="studio-button secondary" type="submit" disabled={!!action || !documentName.trim() || !documentContent.trim()}>{action === 'Ingesting…' ? 'Indexing…' : 'Index document'}</button></form>{status && <div className="studio-notice">{status}</div>}{loading ? <p style={muted}>Loading document index…</p> : <p style={muted}>Documents are persisted in the backend RAG index. Search below to inspect matching chunks.</p>}</section><section className="wide-card"><div className="section-heading"><div><div className="eyebrow">RETRIEVAL</div><h2>Search indexed chunks</h2></div></div><form className="palette-search" onSubmit={search}><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search indexed chunks…" /><button className="studio-button primary" type="submit" disabled={!!action || !query.trim()}>Search</button></form>{results.length === 0 ? <p style={muted}>No indexed chunks returned by the backend.</p> : results.map((item, index) => <div className="retrieval-row" key={item.id || index}><span className="rank">{index + 1}</span><div><strong>{item.document_name || item.id || 'Chunk'}</strong><p style={muted}>{item.content || 'Empty chunk'}</p></div><span className="score">{Number(item.score || 0).toFixed(3)}</span></div>)}</section></div>;
}

function IntegrationsView() {
  const [providers, setProviders] = useState<any[]>([]); const [tools, setTools] = useState<any[]>([]); const [ides, setIdes] = useState<any[]>([]); const [installed, setInstalled] = useState<any[]>([]); const [name, setName] = useState(''); const [status, setStatus] = useState(''); const [loading, setLoading] = useState(true); const [action, setAction] = useState('');
  const load = async () => { setLoading(true); const responses = await Promise.allSettled([api.getPlatformProviders(), api.listTools(), api.listIdeIntegrations(), api.listIntegrations()]); const [providersResult, toolsResult, idesResult, installedResult] = responses; if (providersResult.status === 'fulfilled') setProviders(providersResult.value || []); if (toolsResult.status === 'fulfilled') setTools(toolsResult.value || []); if (idesResult.status === 'fulfilled') setIdes(idesResult.value || []); if (installedResult.status === 'fulfilled') setInstalled(installedResult.value || []); const failed = responses.find((item) => item.status === 'rejected'); if (failed) setStatus(messageOf((failed as PromiseRejectedResult).reason, 'Some integrations could not be loaded.')); setLoading(false); }; useEffect(() => { void load(); }, []);
  const install = async (event: React.FormEvent) => { event.preventDefault(); setAction('Installing…'); setStatus(''); try { await api.installIntegration({ name: name.trim(), type: 'connector', config: {} }); setName(''); setStatus('Connector installed in the backend.'); await load(); } catch (cause: any) { setStatus(messageOf(cause, 'Connector installation failed.')); } finally { setAction(''); } };
  const test = async (id: string) => { setAction(id); try { const response = await api.testIntegration(id); setStatus(`Test ${response.status || 'completed'} · ${id}`); } catch (cause: any) { setStatus(messageOf(cause, 'Connector test failed.')); } finally { setAction(''); } };
  const disable = async (id: string) => { setAction(id); try { await api.disableIntegration(id); setStatus(`Connector disabled · ${id}`); await load(); } catch (cause: any) { setStatus(messageOf(cause, 'Connector could not be disabled.')); } finally { setAction(''); } };
  return <div className="feature-grid"><div className="wide-card"><div className="section-heading"><h2>Connected backend capabilities</h2><button className="studio-button secondary" onClick={load} disabled={loading}><RefreshCw size={13} /> Refresh</button></div>{loading ? <p style={muted}>Loading integrations…</p> : <><div className="score-row"><Metric label="Model providers" value={String(providers.length)} /><Metric label="MCP tools" value={String(tools.length)} /><Metric label="IDE integrations" value={String(ides.length)} /><Metric label="Installed connectors" value={String(installed.length)} /></div><form className="integration-form" onSubmit={install}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Connector name" /><button className="studio-button secondary" type="submit" disabled={!!action || !name.trim()}>{action === 'Installing…' ? 'Installing…' : 'Install connector'}</button></form></>}{status && <div className="studio-notice">{status}</div>}<div className="retrieval-row"><Check size={14} color="var(--success)" /><span>{providers.map((provider) => `${provider.provider}/${provider.model}`).join(' · ') || 'No providers registered'}</span></div><div className="retrieval-row"><Check size={14} color="var(--success)" /><span>{tools.map((tool) => tool.name || tool.toolName).join(' · ') || 'No MCP tools registered'}</span></div>{installed.map((item) => <div className="retrieval-row integration-row" key={item.id}><Check size={14} color={item.status === 'disabled' ? 'var(--text-muted)' : 'var(--success)'} /><span>{item.name} · {item.status}</span><button className="text-button" onClick={() => test(item.id)} disabled={!!action}>Test</button><button className="text-button danger-link" onClick={() => disable(item.id)} disabled={!!action || item.status === 'disabled'}>Disable</button></div>)}<div className="retrieval-row"><Check size={14} color="var(--success)" /><span>{ides.map((ide) => `${ide.ide} · ${ide.status}`).join(' · ') || 'No IDE integration connected'}</span></div></div></div>;
}

function DeployView({ workflowId, workspaceId, workspaceName }: { workflowId: string | null; workspaceId?: string | null; workspaceName?: string }) {
  const [prompt, setPrompt] = useState(''); const [status, setStatus] = useState<any>(null); const [telemetry, setTelemetry] = useState<any>(null); const [result, setResult] = useState(''); const [workers, setWorkers] = useState<any>(null); const [releases, setReleases] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [action, setAction] = useState('');
  const load = async () => { setLoading(true); const responses = await Promise.allSettled([api.getStatus(), api.getPlatformTelemetry(), api.getWorkerHealth(), api.listReleases()]); const [statusResult, telemetryResult, workersResult, releasesResult] = responses; if (statusResult.status === 'fulfilled') setStatus(statusResult.value); if (telemetryResult.status === 'fulfilled') setTelemetry(telemetryResult.value); if (workersResult.status === 'fulfilled') setWorkers(workersResult.value); if (releasesResult.status === 'fulfilled') setReleases(releasesResult.value || []); const failed = responses.find((item) => item.status === 'rejected'); if (failed) setResult(messageOf((failed as PromiseRejectedResult).reason, 'Some runtime data could not be loaded.')); setLoading(false); }; useEffect(() => { void load(); }, []);
  const deploy = async () => { if (!workspaceId) { setResult('Select a project before deploying an agent.'); return; } setAction('Deploying…'); setResult(''); try { const response = await api.deployAgent({ prompt: prompt.trim(), agentType: 'GenOS', modelTier: 'flash', workspaceId }); setResult(`Deployment accepted in ${workspaceName || workspaceId}: ${response.agent?.id || response.agentId || 'backend response received'}`); await load(); } catch (cause: any) { setResult(messageOf(cause, 'Deployment failed.')); } finally { setAction(''); } };
  const createRelease = async () => { if (!workflowId) { setResult('Save the workflow before creating a release.'); return; } setAction('Creating release…'); try { const response = await api.createRelease({ workflowId, version: 1, environment: 'staging', traffic: 100 }); setResult(`Release created: ${response.id}`); await load(); } catch (cause: any) { setResult(messageOf(cause, 'Release creation failed.')); } finally { setAction(''); } };
  const promote = async (id: string) => { setAction(id); try { const response = await api.promoteRelease(id, 'production'); setResult(`Release promoted: ${response.id}`); await load(); } catch (cause: any) { setResult(messageOf(cause, 'Release promotion failed.')); } finally { setAction(''); } };
  const rollback = async (id: string) => { setAction(id); try { const response = await api.rollbackRelease(id); setResult(`Release rolled back: ${response.id}`); await load(); } catch (cause: any) { setResult(messageOf(cause, 'Release rollback failed.')); } finally { setAction(''); } };
  return <div className="deploy-layout"><div className="wide-card"><div className="section-heading"><div><div className="eyebrow">RUNTIME DEPLOYMENT</div><h2>Deploy an agent through the backend</h2></div><button className="studio-button secondary" onClick={load} disabled={loading}><RefreshCw size={13} /> Refresh</button></div><p style={{ ...muted, color: workspaceId ? 'var(--success)' : 'var(--danger)' }}>Workspace: <strong>{workspaceName || (workspaceId ? workspaceId : 'Select a project first')}</strong></p><label>Mission prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the mission to deploy…" /></label><button className="studio-button primary" onClick={deploy} disabled={!!action || !prompt.trim() || !workspaceId}>{action === 'Deploying…' ? 'Deploying…' : workspaceId ? 'Deploy agent' : 'Select a project first'} <ArrowRight size={14} /></button><div className="release-actions"><button className="studio-button secondary" onClick={createRelease} disabled={!!action || !workflowId}>Create staging release</button><span style={muted}>{workflowId ? 'Uses the saved workflow' : 'Save a workflow to release it'}</span></div>{result && <div className="studio-notice">{result}</div>}</div><div className="wide-card"><h2>Live runtime telemetry</h2><div className="score-row"><Metric label="Active agents" value={String(status?.activeAgentsCount ?? 0)} /><Metric label="Telemetry events" value={String(telemetry?.totals?.events ?? 0)} /><Metric label="Tokens" value={String(telemetry?.totals?.tokens ?? 0)} /><Metric label="Cost" value={`$${Number(telemetry?.totals?.costUsd || 0).toFixed(4)}`} /></div><div className="score-row"><Metric label="Job worker" value={`${workers?.active ?? 0}/${workers?.workers ?? 0}`} /><Metric label="Queue depth" value={String(workers?.queueDepth ?? 0)} /><Metric label="Retries" value={String(workers?.retries ?? 0)} /><Metric label="Releases" value={String(releases.length)} /></div><div className="release-list">{releases.length === 0 ? <p style={muted}>No releases persisted in the backend.</p> : releases.map((release) => <div className="release-row" key={release.id}><span><strong>{release.id}</strong><small>{release.environment} · v{release.version} · {release.status}</small></span><span className="builder-actions"><button className="text-button" onClick={() => promote(release.id)} disabled={!!action || release.status === 'active'}>Promote</button><button className="text-button danger-link" onClick={() => rollback(release.id)} disabled={!!action || release.status === 'rolled_back'}>Rollback</button></span></div>)}</div></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
