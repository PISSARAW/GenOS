import React, { useState, useEffect } from 'react';
import { 
  Beaker, Sparkles, Activity, CheckCircle2, ChevronRight, Play, ServerCrash, Cpu, ArrowRight, Shield, Target, Code
} from 'lucide-react';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer, YAxis, CartesianGrid } from 'recharts';
import Editor from '@monaco-editor/react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

type ExperimentView = 'dashboard' | 'setup' | 'monitoring' | 'coevolution' | 'analysis';

export const ExperimentsLab: React.FC = () => {
  const [view, setView] = useState<ExperimentView>('dashboard');
  const [waveData, setWaveData] = useState<any[]>([]);
  const [chaosLevel, setChaosLevel] = useState(40);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [thoughtFeed, setThoughtFeed] = useState<any[]>([]);
  const [coevolutionData, setCoevolutionData] = useState<any>(null);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [activeExperimentId, setActiveExperimentId] = useState<string | null>(null);
  const [protocolType, setProtocolType] = useState('Incident');
  const [protocolTitle, setProtocolTitle] = useState('Memory Saturation Under High Concurrency');
  const showToast = useToastStore((state) => state.showToast);

  const loadLabData = (experimentId = activeExperimentId) => {
    api.listExperiments()
      .then((data) => {
        if (Array.isArray(data)) {
          setExperiments(data);
          const selectedId = experimentId || data[0]?.id;
          if (selectedId) {
            setActiveExperimentId(selectedId);
            api.getExperimentAnalysis(selectedId).then(setAnalysisData).catch(() => {});
            api.getExperimentThoughts(selectedId).then((thoughts) => {
              if (Array.isArray(thoughts)) setThoughtFeed(thoughts);
            }).catch(() => {});
            api.getExperimentCoevolution(selectedId).then(setCoevolutionData).catch(() => {});
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadLabData();
  }, []);

  // Wave points animation
  useEffect(() => {
    if ((view === 'monitoring' || view === 'coevolution') && activeExperimentId) {
      const refresh = () => api.getExperimentWaves(activeExperimentId).then((data) => setWaveData(Array.isArray(data) ? data : [])).catch(() => {});
      refresh();
      const interval = setInterval(refresh, 3000);
      return () => clearInterval(interval);
    }
  }, [view, activeExperimentId]);

  const handleLaunch = async () => {
    try {
      const result = await api.launchExperiment({
        title: protocolTitle,
        type: protocolType,
        chaosLevel
      });
      setActiveExperimentId(result.experimentId);
      setWaveData([]);
      showToast('success', 'Protocol Registered', `${protocolType} protocol is ready for recorded observations.`);
      setView('monitoring');
      loadLabData();
    } catch (e: any) {
      showToast('error', 'Launch Failed', e.message);
    }
  };

  const handlePromoteRule = async () => {
    if (!analysisData?.summary) return;
    try {
      await api.recordDecision({
        title: analysisData.title || 'Rule Mutation from Experiment',
        content: analysisData.summary
      });
      showToast('success', 'Rule Promoted to Genome', 'Injected learned insight into global DNA.');
    } catch (e: any) {
      showToast('error', 'Promotion Failed', e.message);
    }
  };

  // 1. Dashboard View
  const renderDashboard = () => (
    <div style={{ padding: '24px 32px', height: '100%', overflowY: 'auto', background: 'var(--bg-main)' }}>
      <div style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px',
        background: 'var(--bg-panel)', padding: '16px 20px', borderRadius: '6px', border: '1px solid var(--panel-border)'
      }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Beaker size={20} color="var(--text-muted)" /> Scientific Experiments Lab
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0', fontSize: '0.85rem' }}>Register protocols and inspect observations persisted by the backend.</p>
        </div>
        <button onClick={() => setView('setup')} className="gh-btn gh-btn-primary">
          <Sparkles size={14} /> Initialize Protocol
        </button>
      </div>

      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid var(--panel-border)' }}>Registered & Historical Protocols</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', paddingBottom: '24px' }}>
        {experiments.map((exp: any, i: number) => (
          <div key={exp.id || i} onClick={() => { setActiveExperimentId(exp.id); setWaveData([]); loadLabData(exp.id); setView(['running', 'registered'].includes(String(exp.status).toLowerCase()) ? 'monitoring' : 'analysis'); }} style={{
            background: 'var(--bg-panel)',
            border: ['running', 'registered'].includes(String(exp.status).toLowerCase()) ? '1px solid var(--accent-blue)' : '1px solid var(--panel-border)',
            borderRadius: '6px',
            padding: '16px',
            cursor: 'pointer',
            position: 'relative'
          }} className="hover-bg-gray">
            {['running', 'registered'].includes(String(exp.status).toLowerCase()) && <div style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-blue)' }} />}
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: ['running', 'registered'].includes(String(exp.status).toLowerCase()) ? 'var(--accent-blue)' : 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>{exp.type}</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }} className="hover-blue">{exp.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={14} color={['running', 'registered'].includes(String(exp.status).toLowerCase()) ? 'var(--accent-blue)' : 'var(--success)'} /> {exp.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // 2. Setup View
  const renderSetup = () => (
    <div style={{ padding: '24px 32px', height: '100%', overflowY: 'auto', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: '700px', background: 'var(--bg-panel)', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
        
        <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderBottom: '1px solid var(--panel-border)', borderRadius: '6px 6px 0 0' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Protocol Editor</h2>
        </div>

        <div style={{ padding: '24px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Protocol Title</label>
            <input 
              type="text" 
              value={protocolTitle}
              onChange={(e) => setProtocolTitle(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            {['Scientific', 'Incident', 'Co-evolution'].map((type) => (
              <div 
                key={type} 
                onClick={() => setProtocolType(type)}
                style={{ 
                  flex: 1, padding: '16px', border: protocolType === type ? '1px solid var(--accent-blue)' : '1px solid var(--panel-border)', 
                  borderRadius: '6px', textAlign: 'center', cursor: 'pointer', background: protocolType === type ? 'var(--bg-subtle)' : 'var(--bg-main)' 
                }}
              >
                <Activity size={24} color={protocolType === type ? 'var(--accent-blue)' : 'var(--text-muted)'} style={{ marginBottom: '8px' }} />
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: protocolType === type ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{type}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Semantic Chaos Complexity</span>
              <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{chaosLevel}%</span>
            </div>
            <input 
              type="range" 
              min="0" max="100" 
              value={chaosLevel}
              onChange={(e) => setChaosLevel(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-blue)' }}
            />
          </div>

          <div style={{ marginBottom: '24px', border: '1px dashed var(--panel-border)', borderRadius: '6px', padding: '24px', textAlign: 'center', background: 'var(--bg-main)' }}>
            <ServerCrash size={24} color="var(--text-muted)" style={{ marginBottom: '8px' }} />
            <h4 style={{ margin: '0 0 4px 0', color: 'var(--text-primary)', fontSize: '0.85rem' }}>Chaos & Perturbation Engine</h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Inject runtime perturbations (e.g. Memory pressure, Latency, Tool timeouts).</p>
          </div>
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', borderRadius: '0 0 6px 6px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button className="gh-btn" onClick={() => setView('dashboard')}>Cancel</button>
          <button className="gh-btn gh-btn-primary" onClick={handleLaunch}><Play size={14} style={{ marginRight: '4px' }} /> Register Protocol</button>
        </div>
      </div>
    </div>
  );

  // 3. Monitoring View
  const renderMonitoring = () => (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-main)' }}>
      {/* Simulation Arena */}
      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Recorded Experiment Telemetry</h2>
          <button onClick={() => setView('analysis')} className="gh-btn">View Analysis</button>
        </div>
        
        <div style={{ flex: 1, background: 'var(--bg-panel)', borderRadius: '6px', border: '1px solid var(--panel-border)', padding: '24px', position: 'relative', overflow: 'hidden' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={waveData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--panel-border)" />
              <XAxis dataKey="time" hide />
              <YAxis hide domain={[0, 100]} />
              <Tooltip cursor={{ stroke: 'var(--panel-border)', strokeWidth: 1 }} contentStyle={{ background: 'var(--bg-panel)', borderRadius: '6px', border: '1px solid var(--panel-border)', color: 'var(--text-primary)' }} />
              <Line type="monotone" dataKey="successRate" stroke="#3fb950" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="stressLevel" stroke="#58a6ff" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Thought Feed */}
      <div style={{ width: '350px', background: 'var(--bg-panel)', borderLeft: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
          <Cpu size={16} color="var(--text-muted)" /> Recorded Observations
        </div>
        <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {thoughtFeed.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No recorded observations yet.</div>}
          {thoughtFeed.map((thought: any, i: number) => (
            <div key={i} style={{ 
              fontSize: '0.85rem', 
              color: thought.highlight ? 'var(--accent-blue)' : 'var(--text-secondary)', 
              background: thought.highlight ? 'var(--bg-subtle)' : 'transparent',
              padding: thought.highlight ? '8px 12px' : '0 12px',
              borderRadius: '6px',
              borderLeft: thought.highlight ? '2px solid var(--accent-blue)' : 'none'
            }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{thought.time}</span>
              {thought.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // 4. Co-evolution View (Red vs Blue)
  const renderCoevolution = () => {
    if (!coevolutionData) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading coevolution arena...</div>;
    return (
      <div style={{ display: 'flex', height: '100%', background: 'var(--bg-main)' }}>
        
        {/* Red Team */}
        <div style={{ width: '260px', background: 'var(--bg-panel)', borderRight: '1px solid var(--panel-border)', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontWeight: 600, marginBottom: '16px' }}>
            <Target size={18} /> Red Team (Attacker)
          </div>
          {(coevolutionData.redTeam || []).map((item: any, i: number) => (
            <div key={i} style={{ background: 'var(--bg-main)', padding: '12px', borderRadius: '6px', border: '1px solid var(--panel-border)', fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--danger)' }}>Payload #{item.id}</strong><br/>{item.desc}
            </div>
          ))}
        </div>

        {/* Arena (Code Matrix) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', background: 'var(--bg-subtle)' }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Code size={16} /> {coevolutionData.vulnStats?.file || 'src/api/auth.ts'}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontWeight: 600, fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--danger)' }}>{coevolutionData.vulnStats?.vulns || 0} Vulnerabilities</span>
              <span style={{ color: 'var(--text-muted)' }}>vs</span>
              <span style={{ color: 'var(--success)' }}>{coevolutionData.vulnStats?.patches || 0} Patches</span>
            </div>
            <button onClick={() => setView('analysis')} className="gh-btn" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>Stop & Analyze</button>
          </div>
          <div style={{ flex: 1 }}>
            <Editor
              height="100%"
              defaultLanguage="typescript"
              theme="vs-dark"
              value={coevolutionData.code || '// No recorded arena source for this experiment.'}
              options={{ minimap: { enabled: false }, fontSize: 13, readOnly: true }}
            />
          </div>
        </div>

        {/* Blue Team */}
        <div style={{ width: '260px', background: 'var(--bg-panel)', borderLeft: '1px solid var(--panel-border)', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontWeight: 600, marginBottom: '16px' }}>
            <Shield size={18} /> Blue Team (Defender)
          </div>
          {(coevolutionData.blueTeam || []).map((item: any, i: number) => (
            <div key={i} style={{ background: 'var(--bg-main)', padding: '12px', borderRadius: '6px', border: '1px solid var(--panel-border)', fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--success)' }}>{item.title}</strong><br/>{item.desc}
            </div>
          ))}
        </div>

      </div>
    );
  };

  // 5. Analysis View
  const renderAnalysis = () => {
    if (!analysisData) return <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading analysis report...</div>;
    return (
      <div style={{ padding: '48px', height: '100%', overflowY: 'auto', background: 'var(--bg-main)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: '900px' }}>
          <button onClick={() => setView('dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', marginBottom: '24px', fontSize: '0.85rem' }} className="hover-blue">
            <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }}/> Return to Lab Dashboard
          </button>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>{analysisData.title || 'Experiment Verification Report'}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>{analysisData.subtitle || 'No recorded observations for this experiment yet.'}</p>

          {/* Mind Map Conceptuelle */}
          <div style={{ background: 'var(--bg-panel)', borderRadius: '6px', border: '1px solid var(--panel-border)', padding: '24px', marginBottom: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {(analysisData.mindMapNodes || []).map((node: any, idx: number, arr: any[]) => (
              <React.Fragment key={idx}>
                <div style={{ padding: '6px 14px', border: '1px solid var(--panel-border)', background: 'var(--bg-main)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600 }}>
                  {node.label}
                </div>
                {idx < arr.length - 1 && <ArrowRight color="var(--text-muted)" size={16} />}
              </React.Fragment>
            ))}
          </div>

          {/* Synthèse de Décision */}
          <div style={{ background: 'var(--bg-panel)', borderRadius: '6px', border: '1px solid var(--panel-border)' }}>
            <div style={{ padding: '16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', borderRadius: '6px 6px 0 0' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Synthesis of Learned Rules</h3>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-primary)', marginBottom: '24px' }}>
                {analysisData.summary || 'No result has been recorded for this experiment yet.'}
              </p>
              <button onClick={handlePromoteRule} className="gh-btn gh-btn-primary">
                <Sparkles size={14} style={{ marginRight: '8px' }} /> Promote to Global Genome DNA
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {view === 'dashboard' && renderDashboard()}
      {view === 'setup' && renderSetup()}
      {view === 'monitoring' && renderMonitoring()}
      {view === 'coevolution' && renderCoevolution()}
      {view === 'analysis' && renderAnalysis()}
    </div>
  );
};

export default ExperimentsLab;
