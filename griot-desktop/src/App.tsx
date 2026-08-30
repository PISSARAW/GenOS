import { useState } from 'react';
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

function GriotDataView({ data }: { data: any }) {
  if (!data || !data.agents) return null;
  
  const completed = data.agents.filter((a: any) => a.status === 'completed').length;
  const errored = data.agents.filter((a: any) => a.status === 'error').length;
  const total = data.agents.length;

  return (
    <div className="griot-data">
      <div className="griot-summary">
        <strong>Mission Status:</strong> {completed}/{total} agents completed ({errored} errors)
      </div>
      <details className="griot-details">
        <summary>View Telemetry Logs ({data.telemetry?.length || 0} events)</summary>
        <div className="telemetry-log">
          {data.telemetry?.slice(-15).map((t: any, i: number) => (
            <div key={i} className={`log-entry ${t.severity}`}>
              <span className="log-action">[{t.action}]</span> {t.detail}
            </div>
          ))}
          {data.telemetry?.length > 15 && <div className="log-entry">... (logs truncated)</div>}
        </div>
      </details>
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, author: 'Griot', text: 'Griot Local Cognitive Engine ready. How can I assist you with your GenOS tasks today?' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

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
                {parsed.data && <GriotDataView data={parsed.data} />}
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
