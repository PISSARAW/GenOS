import { useState, useEffect } from 'react';
import './index.css';

interface Message {
  id: number;
  author: 'User' | 'Griot';
  text: string;
}

function parseGriotResponse(text: string) {
  const jsonStart = text.indexOf('{');
  if (jsonStart === -1) return { prefix: text, data: null };
  try {
    const data = JSON.parse(text.substring(jsonStart));
    let prefix = text.substring(0, jsonStart).trim();
    
    // Extraire la réponse générée par l'IA (cachée dans la télémétrie)
    if (data.telemetry && Array.isArray(data.telemetry)) {
      const completedEvents = [...data.telemetry].reverse().filter((t: any) => t.event_type === 'AGENT_COMPLETED');
      for (const evt of completedEvents) {
        if (evt.payload_json) {
          try {
            const payload = JSON.parse(evt.payload_json);
            if (payload.evidenceReport && payload.evidenceReport.claims && payload.evidenceReport.claims.length > 0) {
              const statement = payload.evidenceReport.claims[0].statement;
              if (statement) {
                if (typeof statement === 'object' && statement.text) {
                  prefix = statement.text;
                } else if (typeof statement === 'object') {
                  prefix = JSON.stringify(statement);
                } else {
                  prefix = statement;
                }
                break;
              }
            }
          } catch(e) {}
        }
      }
    }
    
    // Si la réponse n'est toujours qu'un log technique de démarrage, on la cache
    if (prefix.includes('starting') && prefix.includes('adapter:')) {
      prefix = "Mission terminée. Voir les détails ci-dessous.";
    }

    return { prefix, data };
  } catch (e) {
    return { prefix: text, data: null };
  }
}

function GriotDataView({ data, showTelemetry }: { data: any, showTelemetry: boolean }) {
  if (!data || !data.agents) return null;
  if (!showTelemetry) return null;
  
  const orchestrator = data.agents.find((a: any) => a.id === data.orchestratorId) || { status: 'unknown' };
  const subAgents = data.agents.filter((a: any) => a.id !== data.orchestratorId);

  return (
    <div className="griot-dashboard">
      <div className="dashboard-card">
        <div className="card-header">🧠 Griot Orchestrator</div>
        <div className="card-body">
          <strong>Status:</strong> <span className={`status-badge ${orchestrator.status}`}>{orchestrator.status}</span>
        </div>
      </div>

      <div className="dashboard-card">
        <div className="card-header">📡 Agent Telemetrique (Observer)</div>
        <div className="card-body">
          <details className="griot-details" open>
            <summary>Flux de communication ({data.telemetry?.length || 0} evenements captures)</summary>
            <div className="telemetry-log">
              {data.telemetry?.slice(-20).map((t: any, i: number) => (
                <div key={i} className={`log-entry ${t.severity}`}>
                  <span className="log-action">[{t.action}]</span> {t.detail}
                </div>
              ))}
              {data.telemetry?.length > 20 && <div className="log-entry">... (anciens logs tronques)</div>}
            </div>
          </details>
        </div>
      </div>

      <div className="dashboard-card">
        <div className="card-header">🐝 Sous-Agents ({subAgents.length})</div>
        <div className="card-body">
          {subAgents.length === 0 ? (
            <span style={{ color: 'var(--text-muted)' }}>Aucun sous-agent deploye.</span>
          ) : (
            <div className="agent-grid">
              {subAgents.map((agent: any) => (
                <div key={agent.id} className="agent-item">
                  <div className="agent-id" title={agent.id}>
                    {agent.id.replace('worker_griot_orchestrator_', 'worker_')}
                  </div>
                  <div className={`status-badge ${agent.status}`}>{agent.status}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SLASH_COMMANDS = [
  // Orchestration & Base
  { cmd: '/trinity ', desc: "Force l'orchestrateur à lancer sur 3 mondes parallèles." },
  { cmd: '/snapshot', desc: "Fige l'état actuel du workspace." },
  { cmd: '/apoptosis', desc: "Stoppe immédiatement tous les sous-agents bloqués." },
  { cmd: '/budget ', desc: "Alloue un nombre maximum de tokens." },
  // Concepts Biomimétiques
  { cmd: '/cryptobiosis', desc: "Gèle l'essaim pour préserver l'état et le budget (Survie Cellulaire)." },
  { cmd: '/redteam', desc: "Déploie un agent parasite pour auditer/attaquer la solution (Immunologie)." },
  { cmd: '/consolidate', desc: "Nettoie et consolide la mémoire vectorielle des erreurs (Neurobiologie)." },
  { cmd: '/hypermutation', desc: "Augmente la température créative d'un agent bloqué (Génétique)." },
  { cmd: '/stigmergy', desc: "Active la coordination indirecte par traces entre agents (Écologie)." }
];

function MessageWithActions({ text }: { text: string }) {
  // Regex pour trouver [ Execute: blabla ]
  const parts = text.split(/(\[\s*Execute:\s*[^\]]+\s*\])/g);
  
  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/\[\s*Execute:\s*([^\]]+)\s*\]/);
        if (match) {
          return (
            <button key={index} className="action-btn" onClick={() => console.log(`Triggering ${match[1]}`)}>
              ▶ Execute: {match[1].trim()}
            </button>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, author: 'Griot', text: 'Griot Local Cognitive Engine ready. How can I assist you with your GenOS tasks today?' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(true);
  const [liveTelemetry, setLiveTelemetry] = useState<any[]>([]);
  
  // New States
  const [selectedModel, setSelectedModel] = useState('auto');
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');

  useEffect(() => {
    try {
      const electron = (window as any).require('electron');
      
      const handleToggle = (_event: any, value: boolean) => {
        setShowTelemetry(value);
      };
      
      const handleStream = (_event: any, evtObj: any) => {
        setLiveTelemetry(prev => {
          const updated = [...prev, evtObj];
          return updated.slice(-30); // Keep last 30 live events to avoid lag
        });
      };

      electron.ipcRenderer.on('toggle-telemetry', handleToggle);
      electron.ipcRenderer.on('telemetry-stream', handleStream);
      
      return () => {
        electron.ipcRenderer.removeListener('toggle-telemetry', handleToggle);
        electron.ipcRenderer.removeListener('telemetry-stream', handleStream);
      };
    } catch (e) {}
  }, []);

  const handleInputChange = (e: any) => {
    const val = e.target.value;
    setInputValue(val);
    
    if (val.startsWith('/')) {
      setSlashMenuVisible(true);
      setSlashFilter(val.substring(1).toLowerCase());
    } else {
      setSlashMenuVisible(false);
    }
  };

  const handleCommandSelect = (cmd: string) => {
    setInputValue(cmd);
    setSlashMenuVisible(false);
  };

  const handleSubmit = async (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!inputValue.trim()) return;
    
    setSlashMenuVisible(false);

    const userMessage: Message = { id: Date.now(), author: 'User', text: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsProcessing(true);
    setLiveTelemetry([]); // Reset live stream

    try {
      const electron = (window as any).require('electron');
      const response = await electron.ipcRenderer.invoke('ask-griot', userMessage.text);
      
      // Nettoyer la réponse des logs de stream parasites
      const cleanResponse = response.split('\n').filter((l: string) => !l.startsWith('GENOS_STREAM:')).join('\n');
      
      setMessages(prev => [...prev, { id: Date.now() + 1, author: 'Griot', text: cleanResponse }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now() + 1, author: 'Griot', text: `Error: ${err}` }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Griot</h1>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Local Cognitive Node</span>
      </header>
      
      <main className="chat-container">
        {messages.map((msg) => {
          const parsed = msg.author === 'Griot' ? parseGriotResponse(msg.text) : { prefix: msg.text, data: null };
          
          return (
            <div key={msg.id} className={`message ${msg.author.toLowerCase()}`}>
              <div className="message-avatar">
                {msg.author === 'User' ? 'U' : 'G'}
              </div>
              <div className="message-content-wrapper">
                <div className="message-author-name">{msg.author}</div>
                <div className="message-text">
                  {parsed.prefix && (
                    <div style={{ marginBottom: parsed.data ? '8px' : '0', whiteSpace: 'pre-wrap' }}>
                      <MessageWithActions text={parsed.prefix} />
                    </div>
                  )}
                  {parsed.data && <GriotDataView data={parsed.data} showTelemetry={showTelemetry} />}
                </div>
              </div>
            </div>
          );
        })}
        
        {isProcessing && (
          <div className="message griot">
            <div className="message-avatar">G</div>
            <div className="message-content-wrapper">
              <div className="message-author-name">Griot</div>
              <div className="message-text">
                {showTelemetry ? (
                  <details className="antigravity-thinking" open>
                    <summary>Thinking Process...</summary>
                    <div className="thinking-content">
                      {liveTelemetry.length === 0 && <div className="log-entry info">Starting mission...</div>}
                      {liveTelemetry.map((t, i) => (
                        <div key={i} className={`log-entry ${t.severity || 'info'}`}>
                          <span className="log-action">[{t.action || 'LIVE'}]</span> {t.detail || 'Traitement...'}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Computing...</span>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <div className="input-container">
        <select 
          className="model-select" 
          value={selectedModel} 
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={isProcessing}
        >
          <option value="auto">Auto Router (Qwen/Mistral)</option>
          <option value="qwen2.5:0.5b">Force: Qwen 2.5</option>
          <option value="mistral-nemo">Force: Mistral Nemo</option>
        </select>

        <div className="input-wrapper">
          {slashMenuVisible && (
            <div className="slash-menu">
              {SLASH_COMMANDS.filter(cmd => cmd.cmd.substring(1).startsWith(slashFilter)).map(cmd => (
                <div 
                  key={cmd.cmd} 
                  className="slash-menu-item"
                  onClick={() => handleCommandSelect(cmd.cmd)}
                >
                  <span className="slash-cmd">{cmd.cmd}</span>
                  <span className="slash-desc">{cmd.desc}</span>
                </div>
              ))}
              {SLASH_COMMANDS.filter(cmd => cmd.cmd.substring(1).startsWith(slashFilter)).length === 0 && (
                <div className="slash-menu-item" style={{ color: 'var(--text-muted)' }}>Aucune commande trouvée</div>
              )}
            </div>
          )}
          <input 
            type="text" 
            placeholder="Ask Griot ou tapez / pour les commandes..." 
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={(e) => { 
              if (e.key === 'Enter') handleSubmit(e as any); 
              if (e.key === 'Escape') setSlashMenuVisible(false);
            }}
            disabled={isProcessing}
          />
        </div>
        <button onClick={handleSubmit as any} disabled={isProcessing || !inputValue.trim()}>Send</button>
      </div>
    </div>
  );
}

export default App;
