import React, { useCallback, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, Check, ChevronRight, CircleDot, Clock3, Code2, Columns2,
  Copy, Database, GitBranch, GripVertical, Layers3, MessageSquare, Play, Plus,
  Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, TerminalSquare,
  Upload, Workflow, Zap,
} from 'lucide-react';
import {
  Background, Controls, MiniMap, ReactFlow, addEdge, useEdgesState, useNodesState,
  type Connection, type Edge, type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

type StudioTab = 'build' | 'prompts' | 'runs' | 'evals' | 'rag' | 'integrations' | 'deploy';

const initialNodes: Node[] = [
  { id: 'trigger', position: { x: 70, y: 150 }, data: { label: 'Trigger\nUser request' }, type: 'default' },
  { id: 'router', position: { x: 330, y: 150 }, data: { label: 'Router\nSelect model' }, type: 'default' },
  { id: 'agent', position: { x: 610, y: 80 }, data: { label: 'Researcher\nGPT-5 · 12k tok' }, type: 'default' },
  { id: 'guard', position: { x: 610, y: 250 }, data: { label: 'Policy check\nPII guardrail' }, type: 'default' },
  { id: 'answer', position: { x: 890, y: 150 }, data: { label: 'Response\nStream result' }, type: 'default' },
];
const initialEdges: Edge[] = [
  { id: 'e1', source: 'trigger', target: 'router', animated: true },
  { id: 'e2', source: 'router', target: 'agent', label: 'primary' },
  { id: 'e3', source: 'router', target: 'guard', label: 'fallback' },
  { id: 'e4', source: 'agent', target: 'answer' },
  { id: 'e5', source: 'guard', target: 'answer' },
];

const tabItems: { id: StudioTab; label: string; icon: React.ReactNode }[] = [
  { id: 'build', label: 'Build', icon: <Workflow size={15} /> },
  { id: 'prompts', label: 'Prompt Lab', icon: <MessageSquare size={15} /> },
  { id: 'runs', label: 'Runs & traces', icon: <Activity size={15} /> },
  { id: 'evals', label: 'Evals', icon: <Sparkles size={15} /> },
  { id: 'rag', label: 'RAG', icon: <Database size={15} /> },
  { id: 'integrations', label: 'Integrations', icon: <Layers3 size={15} /> },
  { id: 'deploy', label: 'Deploy', icon: <Zap size={15} /> },
];

const cardStyle: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: 8 };
const muted: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: 12 };

export const StudioBuilder: React.FC = () => {
  const [tab, setTab] = useState<StudioTab>('build');
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState('router');
  const [promptVersion, setPromptVersion] = useState('v12 · current');
  const [query, setQuery] = useState('');
  const [isRunning, setIsRunning] = useState(false);

  const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge({ ...connection, animated: true }, current)), [setEdges]);
  const addWorkflowNode = (label: string) => {
    const id = `${label.toLowerCase().replace(/\s/g, '-')}-${Date.now()}`;
    setNodes((current) => [...current, { id, position: { x: 420, y: 360 }, data: { label: `${label}\nNew node` }, type: 'default' }]);
  };
  const filteredTraces = useMemo(() => ['run_9f3a · Production · 2m ago', 'run_9f29 · Staging · 14m ago', 'run_9e88 · Replay · yesterday'].filter((item) => item.toLowerCase().includes(query.toLowerCase())), [query]);

  return <div className="studio-builder">
    <div className="studio-builder-header">
      <div><div className="eyebrow"><CircleDot size={12} color="var(--success)" /> STUDIO / WORKFLOW</div><h1>Support triage agent <span className="status-pill">Draft</span></h1><div style={muted}>Production workspace · updated just now · <span className="mono">agent_7f2c</span></div></div>
      <div className="builder-actions"><button className="studio-button secondary"><Copy size={14} /> Import</button><button className="studio-button secondary"><Upload size={14} /> Export</button><button className="studio-button primary" onClick={() => { setIsRunning(true); setTimeout(() => setIsRunning(false), 1400); }}><Play size={14} /> {isRunning ? 'Running…' : 'Run test'}</button></div>
    </div>
    <div className="studio-tabs">{tabItems.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.icon}{item.label}</button>)}</div>
    {tab === 'build' && <BuildView nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} selectedNode={selectedNode} setSelectedNode={setSelectedNode} addWorkflowNode={addWorkflowNode} />}
    {tab === 'prompts' && <PromptLab version={promptVersion} setVersion={setPromptVersion} />}
    {tab === 'runs' && <RunsView traces={filteredTraces} query={query} setQuery={setQuery} />}
    {tab === 'evals' && <EvalsView />}
    {tab === 'rag' && <RagView />}
    {tab === 'integrations' && <IntegrationsView />}
    {tab === 'deploy' && <DeployView />}
  </div>;
};

function BuildView({ nodes, edges, onNodesChange, onEdgesChange, onConnect, selectedNode, setSelectedNode, addWorkflowNode }: any) {
  return <div className="builder-grid"><aside className="builder-panel node-palette"><div className="panel-title">Node palette <SlidersHorizontal size={14} /></div><div className="palette-search"><Search size={14} /><input placeholder="Search nodes" /></div>{['LLM / Agent', 'Tool call', 'Condition', 'Parallel branch', 'Loop', 'Human review', 'Guardrail'].map((item) => <button key={item} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', item)} onClick={() => addWorkflowNode(item)} className="palette-item"><GripVertical size={14} />{item}<Plus size={13} /></button>)}<div className="palette-tip"><Code2 size={14} /><span>Drag nodes onto the canvas or click to add them.</span></div></aside><section className="workflow-canvas"><div className="canvas-toolbar"><span><GitBranch size={14} /> main · v24</span><span style={muted}>Autosaved 12s ago</span><div><button className="icon-button"><Settings2 size={15} /></button><button className="icon-button"><Columns2 size={15} /></button></div></div><div className="flow-wrap"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedNode(node.id)} fitView proOptions={{ hideAttribution: true }}><Background color="#30363d" gap={20} /><Controls /><MiniMap nodeColor="#58a6ff" maskColor="rgba(13,17,23,.7)" /></ReactFlow></div><div className="canvas-footer"><span><span className="live-dot" /> Live preview</span><span>18.4k tokens · $0.042 / run · 1.8s p95</span></div></section><aside className="builder-panel inspector"><div className="panel-title">Inspector <span className="mono">{selectedNode}</span></div><div className="inspector-tabs"><span className="active">Config</span><span>Events</span><span>Metrics</span></div><label>Node type<select><option>Router / model gateway</option><option>LLM / Agent</option><option>Condition</option></select></label><label>Model<select><option>GenOS Router · balanced</option><option>GPT-5 · quality</option><option>Claude Sonnet · fast</option></select></label><label>Condition<textarea defaultValue={'latency_ms < 2500\n&& input.risk != "high"'} /></label><div className="metric-list"><Metric label="Prompt tokens" value="1,284" /><Metric label="Completion tokens" value="842" /><Metric label="Cost / run" value="$0.018" /><Metric label="P95 latency" value="1.8s" /></div><button className="studio-button danger">Delete node</button></aside></div>;
}

function PromptLab({ version, setVersion }: { version: string; setVersion: (v: string) => void }) {
  const [model, setModel] = useState('GPT-5');
  return <div className="prompt-layout"><section className="prompt-editor"><div className="section-heading"><div><div className="eyebrow">PROMPT EDITOR</div><h2>Answer with grounded context</h2></div><select value={version} onChange={(e) => setVersion(e.target.value)}><option>v12 · current</option><option>v11 · 2 days ago</option><option>v10 · archived</option></select></div><div className="prompt-toolbar"><span className="version-dot" /> Saved · v12 <button>Diff against v11</button><button>Duplicate version</button></div><textarea className="prompt-textarea" defaultValue={'You are a concise support agent for {{workspace.name}}.\n\nUse only the retrieved context below. If the answer is uncertain, ask one clarifying question.\n\n<context>\n{{retrieval.chunks}}\n</context>\n\nUser: {{input.message}}'} /><div className="variable-row"><span>Variables</span>{['workspace.name', 'retrieval.chunks', 'input.message'].map((v) => <code key={v}>{'{{'}{v}{'}}'}</code>)}</div></section><section className="playground"><div className="section-heading"><div><div className="eyebrow">MULTI-MODEL PLAYGROUND</div><h2>Compare outputs</h2></div><button className="studio-button primary"><Play size={13} /> Run all</button></div><div className="model-switcher">{['GPT-5', 'Claude Sonnet', 'Gemini 2.5'].map((m) => <button className={model === m ? 'active' : ''} onClick={() => setModel(m)} key={m}>{m}</button>)}</div>{['GPT-5', 'Claude Sonnet'].map((m, i) => <div className="result-card" key={m}><div><strong>{m}</strong><span className="result-meta">{i ? '1,104 tok · 1.2s · $0.009' : '982 tok · 1.8s · $0.018'}</span></div><p>{i ? 'I found three relevant policies. The refund window is 30 days from the original purchase date…' : 'Based on the workspace policy, the refund window is 30 days from the original purchase date…'}</p><div className="token-bar"><span style={{ width: `${i ? 58 : 72}%` }} /></div></div>)}</section></div>;
}

function RunsView({ traces, query, setQuery }: { traces: string[]; query: string; setQuery: (v: string) => void }) {
  return <div className="traces-layout"><aside className="builder-panel trace-list"><div className="section-heading"><h2>Trace explorer</h2><span className="count-badge">248</span></div><div className="palette-search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter traces, spans…" /></div><div className="filter-row"><button className="active">All</button><button>Errors 12</button><button>Slow &gt;2s</button></div>{traces.map((trace, i) => <div className={`trace-row ${i === 0 ? 'selected' : ''}`} key={trace}><div className="trace-status" style={{ background: i === 1 ? 'var(--warning)' : 'var(--success)' }} /><div><strong>{trace}</strong><small>{i === 0 ? '14 spans · 2.1s · $0.042' : '9 spans · 1.4s · $0.019'}</small></div><ChevronRight size={14} /></div>)}</aside><section className="trace-detail"><div className="section-heading"><div><div className="eyebrow">RUN_9F3A · OTEL TRACE</div><h2>Production support request</h2><div style={muted}>Today at 14:32:08 · branch <span className="mono">main</span></div></div><div className="builder-actions"><button className="studio-button secondary"><Copy size={13} /> Compare branch</button><button className="studio-button primary"><Play size={13} /> Replay</button></div></div><div className="trace-metrics"><Metric label="Total duration" value="2.1s" /><Metric label="Tokens" value="2,126" /><Metric label="Cost" value="$0.042" /><Metric label="Spans" value="14" /></div><div className="span-timeline">{['HTTP POST /v1/agent/run', 'router.select_model', 'retriever.search', 'llm.generate', 'guardrail.pii_check'].map((span, i) => <div className="span-line" key={span}><span className="span-label">{span}</span><div className="span-track"><span style={{ left: `${i * 4}%`, width: `${[96, 18, 34, 52, 10][i]}%`, background: i === 3 ? 'var(--accent-purple)' : 'var(--accent-blue)' }} /></div><span className="mono">{['2.1s', '12ms', '420ms', '1.6s', '8ms'][i]}</span></div>)}</div><div className="span-inspector"><div className="inspector-tabs"><span className="active">llm.generate</span><span>Prompt</span><span>Response</span><span>Payload</span><span>Errors</span></div><pre>{`model: gpt-5\nprovider: openai\ninput_tokens: 1,284\noutput_tokens: 842\ncost_usd: 0.018\nstatus: OK\n\nReplay this span with a modified event →`}</pre></div></section></div>;
}

function EvalsView() { return <div className="feature-grid"><FeatureCard icon={<Database />} title="Dataset browser" copy="support-regression · 1,240 cases" action="Open dataset" /><FeatureCard icon={<Sparkles />} title="Batch evaluation" copy="3 graders configured · 92% complete" action="Launch evaluation" /><FeatureCard icon={<GitBranch />} title="Regression view" copy="v24 vs v23 · 18 changed cases" action="Compare versions" /><FeatureCard icon={<ShieldCheck />} title="Graders & policies" copy="Correctness · groundedness · safety" action="Configure graders" /><div className="wide-card"><div className="section-heading"><div><div className="eyebrow">LATEST EVALUATION</div><h2>Support regression · v24</h2></div><span className="status-pill success">Passed</span></div><div className="score-row"><Score label="Overall" value="92.4%" /><Score label="Groundedness" value="96.1%" /><Score label="Correctness" value="91.8%" /><Score label="Safety" value="99.2%" /></div><button className="studio-button secondary">Export evaluation report <ArrowRight size={13} /></button></div></div>; }
function RagView() { return <div className="rag-layout"><section className="wide-card upload-zone"><Upload size={24} color="var(--accent-blue)" /><h2>Drop documents to inspect retrieval</h2><p style={muted}>PDF, Markdown, JSON or CSV · chunks and embeddings stay in this workspace</p><button className="studio-button secondary">Browse files</button></section><div className="wide-card"><div className="section-heading"><div><div className="eyebrow">RETRIEVAL INSPECTOR</div><h2>How context was assembled</h2></div><span className="status-pill success">8 citations</span></div><div className="retrieval-row"><span className="rank">1</span><div><strong>refund-policy.md · chunk 04</strong><p style={muted}>“Refunds are available within 30 days…”</p></div><span className="score">0.94</span><button className="icon-button"><Code2 size={14} /></button></div><div className="retrieval-row"><span className="rank">2</span><div><strong>billing-faq.md · chunk 12</strong><p style={muted}>“Enterprise contracts follow the terms…”</p></div><span className="score">0.88</span><button className="icon-button"><Code2 size={14} /></button></div><div className="embedding-strip">Embedding space · 1536 dimensions <span>rerank score ↑</span><div className="embedding-bars">{Array.from({ length: 28 }).map((_, i) => <i key={i} style={{ height: `${18 + ((i * 17) % 52)}%` }} />)}</div></div></div></div>; }
function IntegrationsView() { return <div className="feature-grid"><FeatureCard icon={<Layers3 />} title="Model providers" copy="OpenAI · Anthropic · Google · 3 connected" action="Manage providers" /><FeatureCard icon={<TerminalSquare />} title="Tool catalog" copy="24 tools · 6 MCP servers · schema ready" action="Test connector" /><FeatureCard icon={<ShieldCheck />} title="Policies & guardrails" copy="PII redaction · prompt injection · RBAC" action="Open policy builder" /><FeatureCard icon={<Settings2 />} title="Secrets & routing" copy="12 secrets · weighted fallback enabled" action="Configure routing" /><div className="wide-card permissions-card"><div className="section-heading"><div><div className="eyebrow">EFFECTIVE PERMISSIONS</div><h2>Production / Support agent</h2></div><span className="status-pill success">Policy compliant</span></div>{['llm.invoke · provider/openai', 'retrieval.read · dataset/support', 'tool.call · jira.create_issue', 'secret.read · OPENAI_API_KEY'].map((p) => <div className="permission-row" key={p}><Check size={14} color="var(--success)" /><span className="mono">{p}</span><span style={muted}>allowed by workspace policy</span></div>)}</div></div>; }
function DeployView() { return <div className="deploy-layout"><div className="wide-card"><div className="section-heading"><div><div className="eyebrow">RELEASE PIPELINE</div><h2>Promote agent version</h2></div><span className="status-pill">v24 · Draft</span></div><div className="release-track">{['Draft', 'Staging', 'Production'].map((stage, i) => <div className={`release-stage ${i === 0 ? 'current' : ''}`} key={stage}><div className="stage-dot">{i === 0 ? '●' : i + 1}</div><strong>{stage}</strong><span style={muted}>{i === 0 ? 'Ready to deploy' : i === 1 ? 'Last deploy 2h ago' : 'v23 · healthy'}</span></div>)}</div><div className="deployment-controls"><label>Endpoint name<input defaultValue="support-triage" /></label><label>Traffic split<select><option>100% v24 after approval</option><option>10% canary / 90% v23</option></select></label><label>Rollback trigger<select><option>Error rate &gt; 2%</option><option>Latency p95 &gt; 4s</option></select></label></div><div className="builder-actions"><button className="studio-button secondary">View diff</button><button className="studio-button primary">Deploy to staging <ArrowRight size={14} /></button></div></div><div className="wide-card"><div className="section-heading"><h2>Workers & queue health</h2><span className="status-pill success">All systems operational</span></div><div className="queue-grid"><Score label="Workers" value="12 / 12" /><Score label="Queue depth" value="24" /><Score label="Retries (24h)" value="0.8%" /><Score label="Stuck jobs" value="0" /></div></div></div>; }

function FeatureCard({ icon, title, copy, action }: { icon: React.ReactNode; title: string; copy: string; action: string }) { return <div className="feature-card" style={cardStyle}><div className="feature-icon">{icon}</div><h2>{title}</h2><p>{copy}</p><button className="text-button">{action} <ArrowRight size={13} /></button></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
function Score({ label, value }: { label: string; value: string }) { return <div className="score-box"><span>{label}</span><strong>{value}</strong></div>; }
