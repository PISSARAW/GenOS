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
    return { prefix: text.substring(0, jsonStart).trim(), data };
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
        <div className="card-header">📡 Agent Télémétrique (Observer)</div>
        <div className="card-body">
          <details className="griot-details" open>
            <summary>Flux de communication ({data.telemetry?.length || 0} événements capturés)</summary>
            <div className="telemetry-log">
              {data.telemetry?.slice(-20).map((t: any, i: number) => (
                <div key={i} className={`log-entry ${t.severity}`}>
                  <span className="log-action">[{t.action}]</span> {t.detail}
                </div>
              ))}
              {data.telemetry?.length > 20 && <div className="log-entry">... (anciens logs tronqués)</div>}
            </div>
          </details>
        </div>
      </div>

      <div className="dashboard-card">
        <div className="card-header">🐝 Sous-Agents ({subAgents.length})</div>
        <div className="card-body">
          {subAgents.length === 0 ? (
            <span style={{ color: 'var(--text-muted)' }}>Aucun sous-agent déployé.</span>
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

function App() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, author: 'Griot', text: 'Griot Local Cognitive Engine ready. How can I assist you with your GenOS tasks today?' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(true);

  useEffect(() => {
    try {
      const electron = (window as any).require('electron');
      const handleToggle = (_event: any, value: boolean) => {
        setShowTelemetry(value);
      };
      electron.ipcRenderer.on('toggle-telemetry', handleToggle);
      return () => {
        electron.ipcRenderer.removeListener('toggle-telemetry', handleToggle);
      };
    } catch (e) {}
  }, []);

  const handleSubmit = async (e: any) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage: Message = { id: Date.now(), author: 'User', text: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsProcessing(true);

    try {
      const electron = (window as any).require('electron');
      const response = await electron.ipcRenderer.invoke('ask-griot', userMessage.text);
      setMessages(prev => [...prev, { id: Date.now() + 1, author: 'Griot', text: response }]);
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
              <div className="message-author">{msg.author}</div>
              <div className="message-content">
                {parsed.prefix && <div style={{ marginBottom: parsed.data ? '8px' : '0', whiteSpace: 'pre-wrap' }}>{parsed.prefix}</div>}
                {parsed.data && <GriotDataView data={parsed.data} showTelemetry={showTelemetry} />}
              </div>
            </div>
          );
        })}
        {isProcessing && (
          <div className="message griot">
            <div className="message-author">Griot</div>
            <div className="message-content" style={{ color: 'var(--text-muted)' }}>Computing...</div>
          </div>
        )}
      </main>

      <div className="input-container">
        <input 
          type="text" 
          placeholder="Ask Griot..." 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(e as any); }}
          disabled={isProcessing}
        />
        <button onClick={handleSubmit as any} disabled={isProcessing || !inputValue.trim()}>Send</button>
      </div>
    </div>
  );
}

export default App;
