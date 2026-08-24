import React, { useEffect, useState } from 'react';
import { Download, Plug, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

export const ComplianceAndIntegrations: React.FC = () => {
  const [frameworks, setFrameworks] = useState<any[]>([]); const [reports, setReports] = useState<any[]>([]); const [integrations, setIntegrations] = useState<any[]>([]); const [schema, setSchema] = useState<any>();
  const showToast = useToastStore((state) => state.showToast);
  const load = async () => { const [f, r, i, s] = await Promise.all([api.listComplianceFrameworks(), api.listComplianceReports(), api.listIdeIntegrations(), api.getSchemaStatus()]); setFrameworks(f); setReports(r); setIntegrations(i); setSchema(s); };
  useEffect(() => { load().catch((e: any) => showToast('error', 'Compliance Data Unavailable', e?.message || 'Backend unreachable.')); }, []);
  const card: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: 8, padding: 16, marginTop: 16 };
  return <div style={{ width: '100%', height: '100%', overflowY: 'auto', padding: 32, background: 'var(--bg-main)' }}><div style={{ maxWidth: 1100, margin: '0 auto' }}><h1>Compliance & Developer Integrations</h1><p style={{ color: 'var(--text-secondary)' }}>Audit evidence, shared IDE commands, and versioned schema control.</p>
    <section style={card}><h2><ShieldCheck size={18} /> Compliance reports</h2><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{frameworks.map((f) => <button key={f.id} onClick={async () => { await api.generateComplianceReport(f.id); await load(); }}>Generate {f.title}</button>)}</div>{reports.map((r) => <div key={r.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: '1px solid var(--panel-border)' }}><span style={{ flex: 1 }}>{r.title} · {r.score}%</span><a href={api.getComplianceExportUrl(r.id, 'markdown')} target="_blank" rel="noreferrer"><Download size={15} /></a></div>)}</section>
    <section style={card}><h2><Plug size={18} /> IDE integrations</h2><p style={{ color: 'var(--text-secondary)' }}>VS Code, JetBrains and Antigravity use the repository contract.</p><div style={{ display: 'flex', gap: 8 }}>{['vscode', 'jetbrains', 'antigravity'].map((ide) => <button key={ide} onClick={async () => { await api.connectIde({ ide }); await load(); }}>{ide} connect</button>)}</div>{integrations.map((i) => <div key={i.id} style={{ marginTop: 8 }}>{i.ide} · {i.version} · {i.status}</div>)}</section>
    <section style={card}><h2><RefreshCw size={18} /> Schema migrations</h2><p>Current version: <strong>{schema?.currentVersion || 'unknown'}</strong> · {schema?.tables?.length || 0} tables</p><button onClick={async () => { await api.applySchemaMigrations(); await load(); }}>Apply pending migrations</button></section>
  </div></div>;
};
